import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StepExecutorService } from './steps/step-executor.service';
import {
  AUTOMATION_QUEUE,
  JOB_POLL_RUNS,
  MAX_RUNS_PER_TICK,
  POLL_EVERY_MS,
  POLL_JOB_ID,
  RUN_LEASE_MS,
} from './automations.constants';

interface DueRun {
  run_id: string;
  tenant_id: string;
}

interface RunRow {
  id: string;
  tenantId: string;
  automationId: string;
  contactId: string;
  currentStepId: string | null;
}

/**
 * The automation scheduler. A repeatable BullMQ job polls every POLL_EVERY_MS
 * (cluster-safe, restart-safe — same pattern as the campaign poller).
 *
 * Per due run:
 *   1. CLAIM in its own committed tx by pushing next_run_at to a lease
 *      (now + RUN_LEASE_MS). If a crash happens during step execution, the lease
 *      expires and the run is re-picked — never permanently stuck.
 *   2. ADVANCE in a second tx (StepExecutor). On a thrown error the run is
 *      marked 'failed' (no poison-loop); a process crash instead relies on the
 *      lease for one retry.
 */
@Processor(AUTOMATION_QUEUE)
export class AutomationRunnerService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AutomationRunnerService.name);

  constructor(
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly executor: StepExecutorService,
  ) {
    super();
  }

  async onModuleInit() {
    const existing = await this.queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === JOB_POLL_RUNS) await this.queue.removeRepeatableByKey(r.key);
    }
    await this.queue.add(
      JOB_POLL_RUNS,
      {},
      {
        repeat: { every: POLL_EVERY_MS },
        jobId: POLL_JOB_ID,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(
      `Automation run poller registered (every ${POLL_EVERY_MS / 1000}s)`,
    );
  }

  async process(_job: Job): Promise<void> {
    const due = await this.prisma.$queryRaw<DueRun[]>`
      SELECT run_id, tenant_id FROM automation_due_runs(${MAX_RUNS_PER_TICK})
    `;
    let advanced = 0;
    for (const d of due) {
      try {
        const claimed = await this.claim(d.run_id, d.tenant_id);
        if (!claimed) continue;
        await this.advanceOne(d.run_id, d.tenant_id);
        advanced += 1;
      } catch (e) {
        this.logger.error(
          `run ${d.run_id} failed: ${(e as Error).message}`,
        );
        await this.markFailed(d.run_id, d.tenant_id);
      }
    }
    if (advanced > 0) this.logger.log(`advanced ${advanced} automation run(s)`);
  }

  /** Atomic lease claim, committed on its own. */
  private async claim(runId: string, tenantId: string): Promise<boolean> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const res = await tx.automationRun.updateMany({
        where: {
          id: runId,
          status: 'running',
          nextRunAt: { lte: new Date() },
        },
        data: { nextRunAt: new Date(Date.now() + RUN_LEASE_MS) },
      });
      return res.count > 0;
    });
  }

  private async advanceOne(runId: string, tenantId: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const run = (await tx.automationRun.findFirst({
        where: { id: runId },
        select: {
          id: true,
          tenantId: true,
          automationId: true,
          contactId: true,
          currentStepId: true,
        },
      })) as RunRow | null;
      if (!run || !run.currentStepId) {
        // nothing to do (already completed, or no step) -> finalize safely
        if (run && !run.currentStepId) {
          await tx.automationRun.updateMany({
            where: { id: runId, status: 'running' },
            data: { status: 'completed', nextRunAt: null, completedAt: new Date() },
          });
        }
        return;
      }
      await this.executor.advance(tx, run);
    });
  }

  private async markFailed(runId: string, tenantId: string) {
    try {
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.automationRun.updateMany({
          where: { id: runId, status: 'running' },
          data: { status: 'failed', nextRunAt: null },
        });
      });
    } catch {
      /* best effort */
    }
  }
}