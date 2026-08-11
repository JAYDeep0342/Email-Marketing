import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Turns "this contact should enter this automation" into an AutomationRun.
 *
 * Re-enrollment policy (default OFF):
 *  - An active ('running') run for (automation, contact) ALWAYS blocks a second
 *    enrollment — also enforced at the DB level by the partial unique index
 *    uq_automation_active_run, so even a race can't create two.
 *  - If triggerConfig.allowReEnrollment !== true, ANY prior run (even completed)
 *    blocks re-enrollment.
 *
 * The new run starts at the first step with next_run_at = now (processed on the
 * next scheduler tick).
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Manual/API enroll — runs in its own tenant tx. */
  async enroll(tenantId: string, automationId: string, contactId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      this.enrollInTx(tx, tenantId, automationId, contactId),
    );
  }

  /**
   * Core enrollment. Returns the created run, or null when skipped
   * (inactive automation, no steps, re-enrollment blocked, missing contact).
   */
  async enrollInTx(
    tx: PrismaClient,
    tenantId: string,
    automationId: string,
    contactId: string,
  ) {
    const automation = await tx.automation.findFirst({
      where: { id: automationId },
      select: { id: true, status: true, triggerConfig: true },
    });
    if (!automation) throw new NotFoundException('Automation not found');
    if (automation.status !== 'active') return null; // only active enrolls

    // contact must exist + be mailable-ish (not deleted). We don't hard-require
    // 'subscribed' here — a tag/list step can run for any contact; the
    // send_email step itself re-checks subscription at send time.
    const contact = await tx.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) return null;

    const allowReEnroll =
      (automation.triggerConfig as any)?.allowReEnrollment === true;

    // Active run always blocks.
    const active = await tx.automationRun.findFirst({
      where: { automationId, contactId, status: 'running' },
      select: { id: true },
    });
    if (active) return null;

    if (!allowReEnroll) {
      const any = await tx.automationRun.findFirst({
        where: { automationId, contactId },
        select: { id: true },
      });
      if (any) return null; // already ran once, re-enrollment disabled
    }

    const firstStep = await tx.automationStep.findFirst({
      where: { automationId },
      orderBy: { stepOrder: 'asc' },
      select: { id: true },
    });
    if (!firstStep) return null; // nothing to do

    try {
      return await tx.automationRun.create({
        data: {
          tenantId,
          automationId,
          contactId,
          currentStepId: firstStep.id,
          status: 'running',
          nextRunAt: new Date(), // process ASAP
        },
      });
    } catch (e) {
      // Unique-index race (uq_automation_active_run): another path just enrolled
      // this contact — treat as a no-op, not an error.
      this.logger.debug(
        `enroll race for automation ${automationId} contact ${contactId}: ${(e as Error).message}`,
      );
      return null;
    }
  }
}