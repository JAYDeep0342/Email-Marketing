import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { SubscriptionsService } from './subscriptions.service';
import { RAZORPAY_EVENTS } from './billing.constants';

/**
 * Razorpay webhook processor. Signature verification happens in the controller
 * (needs raw body); this service only sees already-parsed, already-verified
 * events.
 *
 * Rules:
 *   1. NEVER 4xx â Razorpay retries indefinitely. Unknown event types are
 *      acknowledged (200) but no-op'd here.
 *   2. All writes are idempotent by providerTxnId / providerSubId + event id.
 *   3. This is the ONLY place Tenant.planId flips as a result of a payment
 *      event â routed through subscriptions.applyEffectivePlan.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async handle(event: any): Promise<{ ok: true }> {
    const type = event?.event as string | undefined;
    if (!type) {
      this.logger.warn('Webhook received without event type');
      return { ok: true };
    }

    try {
      switch (type) {
        case RAZORPAY_EVENTS.SUBSCRIPTION_ACTIVATED:
          await this.onActivated(event);
          break;
        case RAZORPAY_EVENTS.SUBSCRIPTION_CHARGED:
          await this.onCharged(event);
          break;
        case RAZORPAY_EVENTS.SUBSCRIPTION_PENDING:
          await this.onPending(event);
          break;
        case RAZORPAY_EVENTS.SUBSCRIPTION_HALTED:
          await this.onHalted(event);
          break;
        case RAZORPAY_EVENTS.SUBSCRIPTION_CANCELLED:
        case RAZORPAY_EVENTS.SUBSCRIPTION_COMPLETED:
          await this.onEnded(event);
          break;
        case RAZORPAY_EVENTS.PAYMENT_FAILED:
          // Recorded as a failed transaction but doesn't flip subscription
          // state â Razorpay's own dunning + subscription.halted event does.
          await this.onPaymentFailed(event);
          break;
        default:
          this.logger.log(`Webhook event ignored: ${type}`);
      }
    } catch (e) {
      // Log but still 200 â retries won't fix a code bug, and 4xx here would
      // just cause Razorpay to spam-retry. Real fix is code, not retry.
      this.logger.error(
        `Webhook handler error for ${type}: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
    return { ok: true };
  }

  // ============================================================
  //  Event handlers
  // ============================================================

  private extractSub(event: any) {
    // Razorpay puts the subscription entity under payload.subscription.entity.
    return event?.payload?.subscription?.entity ?? null;
  }

  private extractPayment(event: any) {
    return event?.payload?.payment?.entity ?? null;
  }

  // `subscriptions` is under FORCE ROW LEVEL SECURITY, and a webhook arrives
  // with only Razorpay's own subscription id — the tenant isn't known yet,
  // which is exactly what this lookup resolves. Same shape as
  // unsubscribe_lookup / auth_find_user_by_email: a SECURITY DEFINER function
  // bypasses RLS for just this read; every WRITE after it happens inside
  // withTenant(tenantId, ...).
  private async findSubByProviderId(
    providerSubId: string,
  ): Promise<{ id: string; tenantId: string; planId: string } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; tenant_id: string; plan_id: string }>
    >`SELECT id, tenant_id, plan_id FROM billing_subscription_lookup_by_provider_id(${providerSubId})`;
    const row = rows[0];
    return row ? { id: row.id, tenantId: row.tenant_id, planId: row.plan_id } : null;
  }

  // Same reasoning for the payment_transactions idempotency check.
  private async paymentTxnExists(providerTxnId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM billing_payment_txn_exists(${providerTxnId})
    `;
    return rows.length > 0;
  }

  // subscription.activated: user completed checkout, first charge succeeded.
  // Local row is currently `pending` â flip to `active`, sync Tenant.planId.
  private async onActivated(event: any) {
    const rzp = this.extractSub(event);
    if (!rzp?.id) return;
    const sub = await this.findSubByProviderId(rzp.id);
    if (!sub) {
      this.logger.warn(`Unknown Razorpay subscription: ${rzp.id}`);
      return;
    }
    await this.prisma.withTenant(sub.tenantId, (tx) =>
      this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
        subscriptionId: sub.id,
        status: 'active',
        currentPeriodStart: rzp.current_start
          ? new Date(rzp.current_start * 1000)
          : new Date(),
        currentPeriodEnd: rzp.current_end
          ? new Date(rzp.current_end * 1000)
          : undefined,
        nextPlanIdForTenant: sub.planId, // grant access
      }),
    );
  }

  // subscription.charged: recurring charge succeeded. Advance period, log
  // an Invoice + PaymentTransaction for the audit trail.
  private async onCharged(event: any) {
    const rzp = this.extractSub(event);
    const payment = this.extractPayment(event);
    if (!rzp?.id || !payment?.id) return;

    const sub = await this.findSubByProviderId(rzp.id);
    if (!sub) return;

    // Idempotency â same payment.id must never insert two transactions.
    if (await this.paymentTxnExists(payment.id)) {
      this.logger.log(`Duplicate charge event ignored: ${payment.id}`);
      return;
    }

    // Find the razorpay gateway id (there's only ever one active per provider).
    // payment_gateways has no tenantId column — it's platform-level, not RLS.
    const gateway = await this.prisma.paymentGateway.findFirst({
      where: { provider: 'razorpay', isActive: true },
      select: { id: true },
    });

    await this.prisma.withTenant(sub.tenantId, async (tx) => {
      // Bump the period + make sure status is `active`.
      await this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
        subscriptionId: sub.id,
        status: 'active',
        currentPeriodStart: rzp.current_start
          ? new Date(rzp.current_start * 1000)
          : undefined,
        currentPeriodEnd: rzp.current_end
          ? new Date(rzp.current_end * 1000)
          : undefined,
        nextPlanIdForTenant: sub.planId,
      });

      // Invoice + transaction record.
      const invoice = await tx.invoice.create({
        data: {
          tenantId: sub.tenantId,
          subscriptionId: sub.id,
          // invoice_number is @unique â use payment.id (already unique in
          // Razorpay's namespace) prefixed. Real invoice numbering can come
          // in Phase 16B when we add InvoiceTemplate rendering.
          invoiceNumber: `RZP-${payment.id}`,
          amountCents: payment.amount ?? 0,
          taxCents: payment.tax ?? 0,
          status: 'paid',
          paidAt: new Date(),
        },
      });
      await tx.paymentTransaction.create({
        data: {
          tenantId: sub.tenantId,
          invoiceId: invoice.id,
          gatewayId: gateway?.id,
          providerTxnId: payment.id,
          type: 'charge',
          amountCents: payment.amount ?? 0,
          status: 'succeeded',
        },
      });
    });
  }

  // subscription.pending: renewal charge in flight, no failure yet.
  private async onPending(event: any) {
    const rzp = this.extractSub(event);
    if (!rzp?.id) return;
    const sub = await this.findSubByProviderId(rzp.id);
    if (!sub) return;
    await this.prisma.withTenant(sub.tenantId, (tx) =>
      this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
        subscriptionId: sub.id,
        status: 'past_due',
        // Access still granted â user is in the grace window.
        nextPlanIdForTenant: sub.planId,
      }),
    );
  }

  // subscription.halted: Razorpay gave up on retries. Freeze the tenant.
  private async onHalted(event: any) {
    const rzp = this.extractSub(event);
    if (!rzp?.id) return;
    const sub = await this.findSubByProviderId(rzp.id);
    if (!sub) return;
    await this.prisma.withTenant(sub.tenantId, (tx) =>
      this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
        subscriptionId: sub.id,
        status: 'unpaid',
        nextPlanIdForTenant: null, // hard-freeze
      }),
    );
  }

  // subscription.cancelled / completed: subscription ended for good.
  private async onEnded(event: any) {
    const rzp = this.extractSub(event);
    if (!rzp?.id) return;
    const sub = await this.findSubByProviderId(rzp.id);
    if (!sub) return;
    await this.prisma.withTenant(sub.tenantId, (tx) =>
      this.subscriptions.applyEffectivePlan(tx, sub.tenantId, {
        subscriptionId: sub.id,
        status: 'ended',
        endedAt: new Date(),
        nextPlanIdForTenant: null, // hard-freeze
      }),
    );
  }

  // payment.failed: audit trail only.
  private async onPaymentFailed(event: any) {
    const payment = this.extractPayment(event);
    if (!payment?.id) return;

    if (await this.paymentTxnExists(payment.id)) return;

    // The payment entity has a subscription_id on it when it's a
    // subscription payment.
    const subId = payment.subscription_id as string | undefined;
    const sub = subId ? await this.findSubByProviderId(subId) : null;

    if (!sub) {
      // Orphan failed payment â log it and move on. No tenant to attribute
      // it to (payment failed before we associated it).
      this.logger.warn(`payment.failed with no matched subscription: ${payment.id}`);
      return;
    }

    // payment_gateways has no tenantId column — it's platform-level, not RLS.
    const gateway = await this.prisma.paymentGateway.findFirst({
      where: { provider: 'razorpay', isActive: true },
      select: { id: true },
    });

    await this.prisma.withTenant(sub.tenantId, (tx) =>
      tx.paymentTransaction.create({
        data: {
          tenantId: sub.tenantId,
          gatewayId: gateway?.id,
          providerTxnId: payment.id,
          type: 'charge',
          amountCents: payment.amount ?? 0,
          status: 'failed',
        },
      }),
    );
  }
}
