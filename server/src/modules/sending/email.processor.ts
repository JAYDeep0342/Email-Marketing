import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService, OutgoingMail } from './mailer.service';
import { UnsubscribeService } from './unsubscribe.service';
import { decryptSecret } from '../../common/utils/crypto.util';
import {
  encodeTrackingToken,
  signUrl,
} from '../../common/utils/signed-token.util';
import {
  EMAIL_QUEUE,
  EMAIL_JOB_ATTEMPTS,
  SendEmailJobData,
} from './sending.constants';

/**
 * Sends exactly one email_job.
 *
 * Design guards:
 *  - Two short transactions (claim, then finalize) with the slow SMTP call
 *    BETWEEN them — never hold a DB connection open across the network
 *    (avoids "idle in transaction" that the QA agent flags).
 *  - Idempotent: a job whose email_job is already terminal is skipped.
 *  - Retries handled by BullMQ (attempts/backoff). On the final failed attempt,
 *    onFailed() marks the email_job 'failed'.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly unsubscribe: UnsubscribeService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<SendEmailJobData>): Promise<void> {
    const { emailJobId, tenantId } = job.data;

    // ---- tx1: claim + assemble everything we need to send ----
    const prepared = await this.prisma.withTenant(tenantId, async (tx) => {
      const ej = await tx.emailJob.findFirst({ where: { id: emailJobId } });
      if (!ej) return null; // vanished
      if (ej.status !== 'queued' && ej.status !== 'sending') return null; // terminal -> skip

      await tx.emailJob.updateMany({
        where: { id: emailJobId },
        data: { status: 'sending', attempts: job.attemptsMade + 1 },
      });

      const contact = await tx.contact.findFirst({
        where: { id: ej.contactId, deletedAt: null },
        select: { email: true, firstName: true, lastName: true, status: true },
      });
      if (!contact || contact.status !== 'subscribed') {
        await tx.emailJob.updateMany({
          where: { id: emailJobId },
          data: { status: 'skipped', error: 'contact not subscribed' },
        });
        return null;
      }

      const campaign = await tx.campaign.findFirst({
        where: { id: ej.campaignId ?? undefined },
        select: {
          id: true,
          subject: true,
          preheader: true,
          fromName: true,
          fromEmail: true,
          signatureId: true,
          templateId: true,
        },
      });
      if (!campaign) return null;

      const [template, signature] = await Promise.all([
        campaign.templateId
          ? tx.template.findFirst({
              where: { id: campaign.templateId, deletedAt: null },
              select: { renderedHtml: true },
            })
          : null,
        campaign.signatureId
          ? tx.signature.findFirst({
              where: { id: campaign.signatureId },
              select: { fromName: true, fromEmail: true, replyTo: true },
            })
          : null,
      ]);

      // Signature identity WINS over inline campaign fields (project convention).
      const fromName = signature?.fromName ?? campaign.fromName ?? '';
      const fromEmail = signature?.fromEmail ?? campaign.fromEmail ?? '';
      const replyTo = signature?.replyTo ?? undefined;

      const rawToken = await this.unsubscribe.ensureToken(
        tx,
        tenantId,
        ej.contactId,
        campaign.id,
      );

      return {
        sendingServerId: ej.sendingServerId,
        contactId: ej.contactId,
        contact,
        subject: campaign.subject,
        preheader: campaign.preheader,
        html: template?.renderedHtml ?? '',
        fromName,
        fromEmail,
        replyTo,
        rawToken,
        campaignId: campaign.id,
      };
    });

    if (!prepared) return; // skipped / terminal / missing — nothing to send

    // ---- build the message (outside any tx) ----
    const base =
      this.config.get<string>('app.publicUrl') ?? 'http://localhost:3000/api';
    const unsubUrl = `${base}/unsubscribe/${prepared.rawToken}`;

    const vars: Record<string, string> = {
      firstName: prepared.contact.firstName ?? '',
      lastName: prepared.contact.lastName ?? '',
      email: prepared.contact.email,
      unsubscribe_url: unsubUrl,
    };
    const subject = this.merge(prepared.subject, vars);
    let html = this.withUnsubscribe(this.merge(prepared.html, vars), unsubUrl);

    // ---- tracking (Step 13): rewrite links for clicks + append open pixel ----
    // Self-contained signed token — the tracking endpoints need no DB lookup.
    const trackToken = encodeTrackingToken({
      j: emailJobId,
      t: tenantId,
      c: prepared.campaignId,
      k: prepared.contactId,
    });
    html = this.rewriteLinks(html, base, trackToken, unsubUrl);
    html = this.withPixel(html, `${base}/t/o/${trackToken}.gif`);

    const from = prepared.fromName
      ? `${prepared.fromName} <${prepared.fromEmail}>`
      : prepared.fromEmail;

    const mail: OutgoingMail = {
      to: prepared.contact.email,
      from,
      replyTo: prepared.replyTo,
      subject,
      html,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
    };

    // ---- pick per-server transport if the chosen server carries SMTP creds ----
    const transport = await this.resolveTransport(prepared.sendingServerId);

    // ---- send (network) ----
    const result = await this.mailer.send(mail, transport);
    if (!result.accepted) {
      throw new Error('SMTP did not accept the message');
    }

    // ---- tx2: mark sent + stats + finalize campaign ----
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.emailJob.updateMany({
        where: { id: emailJobId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.messageId,
          error: null,
        },
      });

      await tx.campaignStat.updateMany({
        where: { campaignId: prepared.campaignId },
        data: { sentCount: { increment: 1 } },
      });

      // Finalize: if no email_jobs remain queued/sending, the campaign is sent.
      const remaining = await tx.emailJob.count({
        where: {
          campaignId: prepared.campaignId,
          status: { in: ['queued', 'sending'] },
        },
      });
      if (remaining === 0) {
        await tx.campaign.updateMany({
          where: { id: prepared.campaignId, status: 'sending' },
          data: { status: 'sent', sentAt: new Date() },
        });
      }
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendEmailJobData>, err: Error) {
    // Only give up (mark failed) once BullMQ has exhausted its retries.
    if (job.attemptsMade < EMAIL_JOB_ATTEMPTS) return;
    const { emailJobId, tenantId } = job.data;
    try {
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.emailJob.updateMany({
          where: { id: emailJobId, status: { in: ['queued', 'sending'] } },
          data: { status: 'failed', error: err.message.slice(0, 500) },
        });
        // A permanently failed job must not wedge the campaign in 'sending'.
        const ej = await tx.emailJob.findFirst({
          where: { id: emailJobId },
          select: { campaignId: true },
        });
        if (ej?.campaignId) {
          const remaining = await tx.emailJob.count({
            where: {
              campaignId: ej.campaignId,
              status: { in: ['queued', 'sending'] },
            },
          });
          if (remaining === 0) {
            await tx.campaign.updateMany({
              where: { id: ej.campaignId, status: 'sending' },
              data: { status: 'sent', sentAt: new Date() },
            });
          }
        }
      });
    } catch (e) {
      this.logger.error(`onFailed bookkeeping error: ${(e as Error).message}`);
    }
  }

  // ---- helpers ----

  private async resolveTransport(sendingServerId: string | null) {
    if (!sendingServerId) return undefined;
    const server = await this.prisma.sendingServer.findUnique({
      where: { id: sendingServerId },
    });
    if (!server || server.provider === 'log') return undefined;
    try {
      const creds = JSON.parse(decryptSecret(server.encryptedCredentials));
      if (!creds || !creds.host) return undefined; // fall back to env/log
      return this.mailer.buildTransportFromCredentials(
        server.encryptedCredentials,
      );
    } catch {
      return undefined;
    }
  }

  private merge(input: string, vars: Record<string, string>): string {
    return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) =>
      k in vars ? vars[k] : '',
    );
  }

  private withUnsubscribe(html: string, url: string): string {
    // If the template already placed the link, merge() handled it.
    if (html.includes(url)) return html;
    const footer = `<div style="margin-top:24px;font-size:12px;color:#888;text-align:center">If you no longer wish to receive these emails, you can <a href="${url}">unsubscribe here</a>.</div>`;
    return html.includes('</body>')
      ? html.replace('</body>', `${footer}</body>`)
      : html + footer;
  }

  /**
   * Rewrite http(s) <a href> targets through the click tracker. Skips the
   * unsubscribe link and any mailto:/tel:/anchor links. Each target is signed
   * so the redirect endpoint can't be abused as an open redirect.
   */
  private rewriteLinks(
    html: string,
    base: string,
    token: string,
    unsubUrl: string,
  ): string {
    return html.replace(
      /href\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi,
      (match, quote, url) => {
        if (url === unsubUrl) return match; // never track the unsubscribe link
        const wrapped = `${base}/t/c/${token}?u=${encodeURIComponent(url)}&s=${signUrl(url)}`;
        return `href=${quote}${wrapped}${quote}`;
      },
    );
  }

  private withPixel(html: string, pixelUrl: string): string {
    const img = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`;
    return html.includes('</body>')
      ? html.replace('</body>', `${img}</body>`)
      : html + img;
  }
}