import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateToken, hashToken } from '../../common/utils/token.util';

interface LookupRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  campaign_id: string | null;
  used_at: Date | null;
}

/**
 * One-click / link unsubscribe.
 *
 * Convention (matches auth tokens): the RAW token goes in the email link; only
 * its SHA-256 hash is stored. The public consume path has NO tenant context, so
 * the lookup uses the unsubscribe_lookup(text) SECURITY DEFINER function to see
 * the row across RLS — then all writes happen inside withTenant(tenant_id).
 */
@Injectable()
export class UnsubscribeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find-or-create a token for (campaign, contact) inside an existing tenant tx.
   * Returns the RAW token to embed in the email. Called from the send path.
   */
  async ensureToken(
    tx: PrismaClient,
    tenantId: string,
    contactId: string,
    campaignId: string,
  ): Promise<string> {
    const existing = await tx.unsubscribeToken.findFirst({
      where: { contactId, campaignId },
      select: { id: true },
    });
    // We only store the hash, so an existing row's raw token is unrecoverable.
    // Rotate it: delete + recreate so the emitted link always matches storage.
    if (existing) {
      await tx.unsubscribeToken.delete({ where: { id: existing.id } });
    }
    const { raw, hash } = generateToken();
    await tx.unsubscribeToken.create({
      data: { tenantId, contactId, campaignId, token: hash },
    });
    return raw;
  }

  /**
   * Public consume. rawToken comes from the URL. Idempotent: an already-used
   * token still reports success (the contact is unsubscribed either way).
   */
  async consume(rawToken: string): Promise<{ message: string }> {
    const hashed = hashToken(rawToken);

    const rows = await this.prisma.$queryRaw<LookupRow[]>`
      SELECT id, tenant_id, contact_id, campaign_id, used_at
      FROM unsubscribe_lookup(${hashed})
    `;
    const row = rows[0];
    if (!row) throw new NotFoundException('Invalid or expired unsubscribe link');

    await this.prisma.withTenant(row.tenant_id, async (tx) => {
      // Mark contact unsubscribed.
      await tx.contact.updateMany({
        where: { id: row.contact_id },
        data: { status: 'unsubscribed' },
      });

      // Add a suppression so future sends skip them. Guard against duplicates.
      const contact = await tx.contact.findFirst({
        where: { id: row.contact_id },
        select: { email: true },
      });
      if (contact) {
        const already = await tx.suppression.findFirst({
          where: { email: contact.email.toLowerCase() },
          select: { id: true },
        });
        if (!already) {
          await tx.suppression.create({
            data: {
              tenantId: row.tenant_id,
              email: contact.email.toLowerCase(),
              reason: 'unsubscribe',
            },
          });
        }
      }

      // Burn the token.
      if (!row.used_at) {
        await tx.unsubscribeToken.updateMany({
          where: { id: row.id },
          data: { usedAt: new Date() },
        });
      }

      // Best-effort stat. Guard: an undefined campaignId in updateMany would
      // have an EMPTY where and hit every row — only run when we have an id.
      if (row.campaign_id) {
        await tx.campaignStat.updateMany({
          where: { campaignId: row.campaign_id },
          data: { unsubscribeCount: { increment: 1 } },
        });
      }
    });

    return { message: 'You have been unsubscribed.' };
  }
}