// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from '../../prisma/prisma.service';
// import { paginated } from '../../common/dto/pagination.dto';
// import { CreateSegmentDto, UpdateSegmentDto } from './dto/segments.dto';

// // Whitelisted fields for safety
// const DIRECT_FIELDS = new Set(['status', 'email', 'firstName', 'lastName']);

// interface Condition {
//   field: string;
//   op: 'eq' | 'neq' | 'contains';
//   value: string;
// }
// interface Rules {
//   match: 'all' | 'any';
//   conditions: Condition[];
// }

// @Injectable()
// export class SegmentsService {
//   constructor(private readonly prisma: PrismaService) {}

//   list() {
//     return this.prisma.withCurrentTenant((tx) =>
//       tx.segment.findMany({ orderBy: { createdAt: 'desc' } }),
//     );
//   }

//   create(tenantId: string, dto: CreateSegmentDto) {
//     return this.prisma.withCurrentTenant((tx) =>
//       tx.segment.create({
//         data: { tenantId, name: dto.name, rules: dto.rules as any },
//       }),
//     );
//   }

//   async update(id: string, dto: UpdateSegmentDto) {
//     return this.prisma.withCurrentTenant(async (tx) => {
//       const seg = await tx.segment.findFirst({
//         where: { id },
//         select: { id: true },
//       });
//       if (!seg) throw new NotFoundException('Segment not found');
//       return tx.segment.update({
//         where: { id },
//         data: { name: dto.name, rules: dto.rules as any },
//       });
//     });
//   }

//   async remove(id: string) {
//     return this.prisma.withCurrentTenant(async (tx) => {
//       const seg = await tx.segment.findFirst({
//         where: { id },
//         select: { id: true },
//       });
//       if (!seg) throw new NotFoundException('Segment not found');
//       await tx.segment.delete({ where: { id } });
//       return { message: 'Segment deleted' };
//     });
//   }

//   // GET /segments/:id/preview
//   async preview(id: string, page: number, limit: number) {
//     return this.prisma.withCurrentTenant(async (tx) => {
//       const seg = await tx.segment.findFirst({ where: { id } });
//       if (!seg) throw new NotFoundException('Segment not found');

//       const where = this.buildWhere(seg.rules as unknown as Rules);

//       const [data, total] = await Promise.all([
//         tx.contact.findMany({
//           where,
//           orderBy: { createdAt: 'desc' },
//           skip: (page - 1) * limit,
//           take: limit,
//         }),
//         tx.contact.count({ where }),
//       ]);
//       const result = paginated(data, total, page, limit);
//       return { data: result.data, meta: { ...result.meta, matchCount: total } };
//     });
//   }

//   // Safely translate rules -> Prisma where. Whitelist fields + ops.
//   private buildWhere(rules: Rules): any {
//     if (!rules?.conditions?.length) return { deletedAt: null };

//     const clauses = rules.conditions.map((c) => this.buildCondition(c));
//     const combined = rules.match === 'any' ? { OR: clauses } : { AND: clauses };
//     return { deletedAt: null, ...combined };
//   }

//   private buildCondition(c: Condition): any {
//     // attributes.<key> -> JSON path filter
//     if (c.field.startsWith('attributes.')) {
//       const key = c.field.slice('attributes.'.length);
//       if (!key || key.includes('.'))
//         throw new BadRequestException(`Invalid attribute field: ${c.field}`);
//       switch (c.op) {
//         case 'eq':
//           return { attributes: { path: [key], equals: c.value } };
//         case 'neq':
//           return { NOT: { attributes: { path: [key], equals: c.value } } };
//         case 'contains':
//           return { attributes: { path: [key], string_contains: c.value } };
//       }
//     }

//     if (!DIRECT_FIELDS.has(c.field)) {
//       throw new BadRequestException(`Field not allowed in segment: ${c.field}`);
//     }

//     switch (c.op) {
//       case 'eq':
//         return { [c.field]: c.value };
//       case 'neq':
//         return { NOT: { [c.field]: c.value } };
//       case 'contains':
//         return { [c.field]: { contains: c.value, mode: 'insensitive' } };
//     }
//   }
// }


import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated } from '../../common/dto/pagination.dto';
import { CreateSegmentDto, UpdateSegmentDto } from './dto/segments.dto';

// Whitelisted fields for safety
const DIRECT_FIELDS = new Set(['status', 'email', 'firstName', 'lastName']);

interface Condition {
  field: string;
  op: 'eq' | 'neq' | 'contains';
  value: string;
}
interface Rules {
  match: 'all' | 'any';
  conditions: Condition[];
}

/** Shape returned to other modules (campaigns) when resolving an audience. */
export interface SegmentContact {
  id: string;
  email: string;
  status: string;
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withCurrentTenant((tx) =>
      tx.segment.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  create(tenantId: string, dto: CreateSegmentDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.segment.create({
        data: { tenantId, name: dto.name, rules: dto.rules as any },
      }),
    );
  }

  async update(id: string, dto: UpdateSegmentDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const seg = await tx.segment.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!seg) throw new NotFoundException('Segment not found');
      return tx.segment.update({
        where: { id },
        data: { name: dto.name, rules: dto.rules as any },
      });
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const seg = await tx.segment.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!seg) throw new NotFoundException('Segment not found');
      await tx.segment.delete({ where: { id } });
      return { message: 'Segment deleted' };
    });
  }

  // GET /segments/:id/preview
  async preview(id: string, page: number, limit: number) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const seg = await tx.segment.findFirst({ where: { id } });
      if (!seg) throw new NotFoundException('Segment not found');

      const where = this.buildWhere(seg.rules as unknown as Rules);

      const [data, total] = await Promise.all([
        tx.contact.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.contact.count({ where }),
      ]);
      const result = paginated(data, total, page, limit);
      return { data: result.data, meta: { ...result.meta, matchCount: total } };
    });
  }

  /**
   * ---- ADDED FOR STEP 11 (Campaigns) ----
   * Resolve every contact matching a segment, reusing the SAME whitelisted
   * rule->where builder as `preview`.
   *
   * Takes an EXISTING `tx` instead of opening its own `withCurrentTenant`,
   * because PrismaService.withTenant() uses $transaction() and the tx client
   * cannot start a nested transaction. The caller (campaigns) already holds a
   * tenant-scoped tx, so RLS is in force here.
   *
   * Only ONE copy of the rule-evaluation logic exists — do not duplicate
   * buildWhere/buildCondition into another module.
   */
  async resolveContacts(
    tx: PrismaClient,
    segmentId: string,
  ): Promise<SegmentContact[]> {
    const seg = await tx.segment.findFirst({ where: { id: segmentId } });
    if (!seg) throw new NotFoundException('Segment not found');

    const where = this.buildWhere(seg.rules as unknown as Rules);
    return tx.contact.findMany({
      where,
      select: { id: true, email: true, status: true },
    }) as unknown as Promise<SegmentContact[]>;
  }

  // Safely translate rules -> Prisma where. Whitelist fields + ops.
  private buildWhere(rules: Rules): any {
    if (!rules?.conditions?.length) return { deletedAt: null };

    const clauses = rules.conditions.map((c) => this.buildCondition(c));
    const combined = rules.match === 'any' ? { OR: clauses } : { AND: clauses };
    return { deletedAt: null, ...combined };
  }

  private buildCondition(c: Condition): any {
    // attributes.<key> -> JSON path filter
    if (c.field.startsWith('attributes.')) {
      const key = c.field.slice('attributes.'.length);
      if (!key || key.includes('.'))
        throw new BadRequestException(`Invalid attribute field: ${c.field}`);
      switch (c.op) {
        case 'eq':
          return { attributes: { path: [key], equals: c.value } };
        case 'neq':
          return { NOT: { attributes: { path: [key], equals: c.value } } };
        case 'contains':
          return { attributes: { path: [key], string_contains: c.value } };
      }
    }

    if (!DIRECT_FIELDS.has(c.field)) {
      throw new BadRequestException(`Field not allowed in segment: ${c.field}`);
    }

    switch (c.op) {
      case 'eq':
        return { [c.field]: c.value };
      case 'neq':
        return { NOT: { [c.field]: c.value } };
      case 'contains':
        return { [c.field]: { contains: c.value, mode: 'insensitive' } };
    }
  }
}
