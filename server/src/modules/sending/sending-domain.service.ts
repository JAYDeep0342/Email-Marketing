import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveTxt } from 'dns/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSendingDomainDto } from './dto/sending.dto';

/**
 * sending_domains IS tenant-scoped (has tenant_id) — all reads/writes go
 * through withCurrentTenant so RLS is enforced.
 *
 * Verification is REAL DNS, replacing the old signature-verify stub:
 *   - SPF   : a TXT at the apex starting with "v=spf1"
 *   - DKIM  : a TXT at "<selector>._domainkey.<domain>" containing "v=DKIM1"
 *             (default selector configurable; we look up a small set)
 *   - DMARC : a TXT at "_dmarc.<domain>" starting with "v=DMARC1"
 * status becomes 'verified' only when SPF AND DKIM pass (DMARC is advisory).
 */
@Injectable()
export class SendingDomainService {
  constructor(private readonly prisma: PrismaService) {}

  // Selectors we probe for DKIM. Most providers use one of these.
  private readonly DKIM_SELECTORS = ['default', 'mail', 'dkim', 's1', 'google'];

  async create(tenantId: string, dto: CreateSendingDomainDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const domain = dto.domain.toLowerCase().trim();
      const existing = await tx.sendingDomain.findFirst({ where: { domain } });
      if (existing) {
        throw new ConflictException('Domain already added');
      }
      return tx.sendingDomain.create({
        data: { tenantId, domain, status: 'pending' },
      });
    });
  }

  async list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.sendingDomain.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const row = await tx.sendingDomain.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Domain not found');
      await tx.sendingDomain.delete({ where: { id } });
      return { message: 'Domain removed' };
    });
  }

  /**
   * POST /sending-domains/:id/verify — runs live DNS lookups and persists the
   * result. Kept tenant-scoped so a tenant can only verify its own domain.
   */
  async verify(id: string) {
    // Load inside tenant scope, but run DNS OUTSIDE the transaction so we never
    // hold a DB connection open across slow network calls (avoids idle-in-tx).
    const domain = await this.prisma.withCurrentTenant(async (tx) => {
      const row = await tx.sendingDomain.findFirst({ where: { id } });
      if (!row) throw new NotFoundException('Domain not found');
      return row.domain;
    });

    const [spf, dkim, dmarc] = await Promise.all([
      this.checkSpf(domain),
      this.checkDkim(domain),
      this.checkDmarc(domain),
    ]);

    const status = spf && dkim ? 'verified' : 'failed';

    return this.prisma.withCurrentTenant((tx) =>
      tx.sendingDomain.update({
        where: { id },
        data: {
          spfVerified: spf,
          dkimVerified: dkim,
          dmarcVerified: dmarc,
          status,
        },
      }),
    );
  }

  // ---- DNS helpers (best-effort; any lookup error => not verified) ----

  private async txt(name: string): Promise<string[]> {
    try {
      const records = await resolveTxt(name);
      // resolveTxt returns string[][] (chunked) — join each record's chunks.
      return records.map((chunks) => chunks.join(''));
    } catch {
      return [];
    }
  }

  private async checkSpf(domain: string): Promise<boolean> {
    const recs = await this.txt(domain);
    return recs.some((r) => r.toLowerCase().startsWith('v=spf1'));
  }

  private async checkDmarc(domain: string): Promise<boolean> {
    const recs = await this.txt(`_dmarc.${domain}`);
    return recs.some((r) => r.toLowerCase().startsWith('v=dmarc1'));
  }

  private async checkDkim(domain: string): Promise<boolean> {
    for (const sel of this.DKIM_SELECTORS) {
      const recs = await this.txt(`${sel}._domainkey.${domain}`);
      if (recs.some((r) => r.toLowerCase().includes('v=dkim1'))) return true;
    }
    return false;
  }
}