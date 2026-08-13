import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentService } from './enrollment.service';
import {
  AUTOMATION_TRIGGER_EVENT,
  type AutomationTriggerPayload,
} from './automations.constants';

/**
 * Listens for domain events emitted by other modules (contacts, lists,
 * tracking) and enrolls matching contacts. Fully decoupled: emitters only push
 * a generic AUTOMATION_TRIGGER_EVENT and never import the automations module.
 *
 * Runs OUTSIDE the emitting request's tenant context, so it always uses the
 * tenantId from the payload with withTenant() (never CLS).
 */
@Injectable()
export class AutomationTriggerListener {
  private readonly logger = new Logger(AutomationTriggerListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollment: EnrollmentService,
  ) {}

  @OnEvent(AUTOMATION_TRIGGER_EVENT, { async: true })
  async handle(payload: AutomationTriggerPayload): Promise<void> {
    try {
      await this.prisma.withTenant(payload.tenantId, async (tx) => {
        // Find active automations for this trigger type in this tenant.
        const automations = await tx.automation.findMany({
          where: { triggerType: payload.triggerType, status: 'active' },
          select: { id: true, triggerConfig: true },
        });

        for (const a of automations) {
          if (!this.configMatches(a.triggerConfig, payload)) continue;
          await this.enrollment.enrollInTx(
            tx,
            payload.tenantId,
            a.id,
            payload.contactId,
          );
        }
      });
    } catch (e) {
      // Never let a trigger failure bubble into the emitting request.
      this.logger.error(
        `trigger ${payload.triggerType} failed for tenant ${payload.tenantId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Trigger-config gating. For list-scoped triggers the automation's
   * triggerConfig.listId must match the event's context.listId. Triggers with
   * no scoping (contact_created, email_opened/clicked, manual) always match.
   */
  private configMatches(
    triggerConfig: unknown,
    payload: AutomationTriggerPayload,
  ): boolean {
    const cfg = (triggerConfig ?? {}) as Record<string, unknown>;
    if (payload.triggerType === 'contact_added_to_list') {
      if (!cfg.listId) return true; // unscoped: any list
      return cfg.listId === payload.context?.listId;
    }
    // email_opened / email_clicked could be scoped by campaignId in future;
    // v1 matches any.
    return true;
  }
}