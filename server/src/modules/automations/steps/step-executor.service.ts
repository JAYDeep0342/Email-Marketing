import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaClient } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SendingServerService } from '../../sending/sending-server.service';
import {
  EMAIL_QUEUE,
  EMAIL_JOB_ATTEMPTS,
  EMAIL_JOB_BACKOFF_MS,
  JOB_SEND_EMAIL,
} from '../../sending/sending.constants';
import { MAX_STEPS_PER_TICK } from '../automations.constants';

interface RunRef {
  id: string;
  tenantId: string;
  automationId: string;
  contactId: string;
  currentStepId: string | null;
}

interface StepRow {
  id: string;
  stepOrder: number;
  stepType: string;
  config: any;
}

/**
 * Executes a claimed run forward. Loops through consecutive IMMEDIATE steps
 * (tag/list/condition/send) in one pass, and stops when it hits a 'wait'
 * (schedules next_run_at) or the run completes. A crash mid-pass is safe: the
 * lease on next_run_at expires and the run is re-picked (send_email is
 * idempotent via a deterministic idempotency key).
 *
 * Runs inside the caller's tenant tx (no nested transaction).
 */
@Injectable()
export class StepExecutorService {
  private readonly logger = new Logger(StepExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: SendingServerService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  /** Collected email jobs to enqueue AFTER the tx commits (no Redis in tx). */
  private pending: { emailJobId: string; tenantId: string }[] = [];

  async advance(tx: PrismaClient, run: RunRef): Promise<void> {
    this.pending = [];
    let stepId = run.currentStepId;
    let guard = 0;

    while (stepId && guard++ < MAX_STEPS_PER_TICK) {
      const step = (await tx.automationStep.findFirst({
        where: { id: stepId },
      })) as StepRow | null;
      if (!step) break; // step deleted mid-flight -> complete below

      const outcome = await this.runStep(tx, run, step);

      if (outcome.kind === 'wait') {
        const next = await this.nextStep(tx, run.automationId, step.stepOrder);
        await tx.automationRun.updateMany({
          where: { id: run.id },
          data: {
            currentStepId: next?.id ?? null,
            nextRunAt: outcome.until,
            // if there is no next step after the wait, it will complete on the
            // next tick (currentStepId null -> completed path)
          },
        });
        await this.flush();
        return;
      }

      if (outcome.kind === 'exit') {
        await this.complete(tx, run.id);
        await this.flush();
        return;
      }

      // 'continue' -> move to the next step
      const next = await this.nextStep(tx, run.automationId, step.stepOrder);
      stepId = next?.id ?? null;
      await tx.automationRun.updateMany({
        where: { id: run.id },
        data: { currentStepId: stepId },
      });
    }

    if (!stepId) {
      // ran off the end -> completed
      await this.complete(tx, run.id);
    } else {
      // hit the per-tick cap: yield, continue next tick
      await tx.automationRun.updateMany({
        where: { id: run.id },
        data: { nextRunAt: new Date() },
      });
    }
    await this.flush();
  }

  // ---- individual step handlers ----

  private async runStep(
    tx: PrismaClient,
    run: RunRef,
    step: StepRow,
  ): Promise<{ kind: 'continue' } | { kind: 'wait'; until: Date } | { kind: 'exit' }> {
    const cfg = step.config ?? {};
    switch (step.stepType) {
      case 'wait':
        return { kind: 'wait', until: this.computeWaitUntil(cfg) };

      case 'exit':
        return { kind: 'exit' };

      case 'send_email':
        await this.doSendEmail(tx, run, step, cfg);
        return { kind: 'continue' };

      case 'add_tag':
        // Guard: the tag must belong to THIS tenant (tags is RLS-scoped, so a
        // findFirst returns null for a foreign tagId) — prevents an automation
        // from tagging via another tenant's tag id.
        if (cfg.tagId && (await this.ownsTag(tx, cfg.tagId))) {
          await tx.contactTag.upsert({
            where: {
              contactId_tagId: { contactId: run.contactId, tagId: cfg.tagId },
            },
            create: { contactId: run.contactId, tagId: cfg.tagId },
            update: {},
          });
        }
        return { kind: 'continue' };

      case 'remove_tag':
        if (cfg.tagId && (await this.ownsTag(tx, cfg.tagId))) {
          await tx.contactTag.deleteMany({
            where: { contactId: run.contactId, tagId: cfg.tagId },
          });
        }
        return { kind: 'continue' };

      case 'add_to_list':
        // Guard: the list must belong to THIS tenant (lists is RLS-scoped) —
        // list_contacts has no tenant_id/RLS of its own, so this app-level check
        // is the only thing stopping a cross-tenant add.
        if (cfg.listId && (await this.ownsList(tx, cfg.listId))) {
          await tx.listContact.upsert({
            where: {
              listId_contactId: {
                listId: cfg.listId,
                contactId: run.contactId,
              },
            },
            create: { listId: cfg.listId, contactId: run.contactId },
            update: {},
          });
        }
        return { kind: 'continue' };

      case 'condition':
        return (await this.evalCondition(tx, run, cfg))
          ? { kind: 'continue' }
          : cfg.onFalse === 'continue'
            ? { kind: 'continue' }
            : { kind: 'exit' };

      default:
        this.logger.warn(`unknown step type '${step.stepType}' — skipping`);
        return { kind: 'continue' };
    }
  }

  private async doSendEmail(
    tx: PrismaClient,
    run: RunRef,
    step: StepRow,
    cfg: any,
  ) {
    const server = await this.servers.pickActive();
    // Deterministic key: one send per (run, step) — safe against re-leased runs.
    const idempotencyKey = `auto:${run.id}:step:${step.id}`;

    await tx.emailJob.createMany({
      data: [
        {
          tenantId: run.tenantId,
          campaignId: null,
          automationRunId: run.id,
          contactId: run.contactId,
          sendingServerId: server?.id ?? null,
          idempotencyKey,
          status: 'queued',
        },
      ],
      skipDuplicates: true, // re-execution can't create a second job
    });

    const job = await tx.emailJob.findFirst({
      where: { tenantId: run.tenantId, idempotencyKey },
      select: { id: true, status: true },
    });
    // Only enqueue if it's freshly queued (not a leftover already sent).
    if (job && job.status === 'queued') {
      this.pending.push({ emailJobId: job.id, tenantId: run.tenantId });
    }
  }

  private async evalCondition(
    tx: PrismaClient,
    run: RunRef,
    cfg: any,
  ): Promise<boolean> {
    if (cfg.kind === 'has_tag' && cfg.tagId) {
      // ownsTag guard keeps the check within the tenant's own tags.
      if (!(await this.ownsTag(tx, cfg.tagId))) return false;
      const row = await tx.contactTag.findFirst({
        where: { contactId: run.contactId, tagId: cfg.tagId },
        select: { tagId: true },
      });
      return !!row;
    }
    // Unknown condition -> treat as true (continue) to avoid silent drops.
    return true;
  }

  // ---- ownership guards (RLS-scoped parent lookups) ----

  private async ownsTag(tx: PrismaClient, tagId: string): Promise<boolean> {
    const t = await tx.tag.findFirst({ where: { id: tagId }, select: { id: true } });
    return !!t;
  }

  private async ownsList(tx: PrismaClient, listId: string): Promise<boolean> {
    const l = await tx.list.findFirst({ where: { id: listId }, select: { id: true } });
    return !!l;
  }

  // ---- helpers ----

  private computeWaitUntil(cfg: any): Date {
    const mins =
      (Number(cfg.minutes) || 0) +
      (Number(cfg.hours) || 0) * 60 +
      (Number(cfg.days) || 0) * 1440;
    const ms = Math.max(mins, 0) * 60_000;
    return new Date(Date.now() + (ms || 60_000)); // default 1 min if unset
  }

  private async nextStep(
    tx: PrismaClient,
    automationId: string,
    afterOrder: number,
  ): Promise<{ id: string } | null> {
    return tx.automationStep.findFirst({
      where: { automationId, stepOrder: { gt: afterOrder } },
      orderBy: { stepOrder: 'asc' },
      select: { id: true },
    });
  }

  private async complete(tx: PrismaClient, runId: string) {
    await tx.automationRun.updateMany({
      where: { id: runId },
      data: {
        status: 'completed',
        currentStepId: null,
        nextRunAt: null,
        completedAt: new Date(),
      },
    });
  }

  private async flush() {
    for (const p of this.pending) {
      await this.emailQueue.add(JOB_SEND_EMAIL, p, {
        jobId: p.emailJobId,
        attempts: EMAIL_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: EMAIL_JOB_BACKOFF_MS },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    }
    this.pending = [];
  }
}