import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /roles — system (tenantId null) + tenant-specific (tenant scope
  // comes from CLS via withCurrentTenant, not a param)
  async list() {
    return this.prisma.withCurrentTenant(async (tx) => {
      // The roles_select RLS policy allows both own-tenant rows and
      // system rows (tenant_id IS NULL), so a single query covers both.
      const roles = await tx.role.findMany({
        include: {
          rolePermissions: {
            select: { permission: { select: { key: true } } },
          },
        },
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      });

      return roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.rolePermissions.map((rp) => rp.permission.key),
      }));
    });
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const role = await tx.role.create({
        data: { tenantId, name: dto.name, description: dto.description },
      });

      if (dto.permissions?.length) {
        await this.attachPermissions(tx, role.id, dto.permissions);
      }
      return {
        id: role.id,
        name: role.name,
        permissions: dto.permissions ?? [],
      };
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.isSystem)
        throw new ForbiddenException('System roles cannot be modified');

      const updated = await tx.role.update({
        where: { id },
        data: { name: dto.name, description: dto.description },
      });

      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.attachPermissions(tx, id, dto.permissions);
      }
      return { id: updated.id, name: updated.name };
    });
  }

  async remove(id: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.isSystem)
        throw new ForbiddenException('System roles cannot be deleted');

      await tx.role.delete({ where: { id } });
      return { message: 'Role deleted' };
    });
  }

  // POST /users/:userId/roles
  async assignToUser(userId: string, roleId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId },
      });
      return { message: 'Role assigned' };
    });
  }

  async removeFromUser(userId: string, roleId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      await tx.userRole
        .delete({ where: { userId_roleId: { userId, roleId } } })
        .catch(() => {
          throw new NotFoundException('Role assignment not found');
        });
      return { message: 'Role removed' };
    });
  }

  // GET /permissions
  async listPermissions() {
    // Permissions are global (no tenant_id) — raw read
    return this.prisma.$queryRaw<Array<{ key: string; description: string }>>`
      SELECT key, description FROM permissions ORDER BY key`;
  }

  private async attachPermissions(
    tx: PrismaClient,
    roleId: string,
    keys: string[],
  ) {
    const perms = await this.prisma.$queryRaw<
      Array<{ id: string; key: string }>
    >`
      SELECT id, key FROM permissions WHERE key = ANY(${keys})`;
    if (perms.length !== keys.length) {
      const found = perms.map((p) => p.key);
      const missing = keys.filter((k) => !found.includes(k));
      throw new BadRequestException(
        `Unknown permissions: ${missing.join(', ')}`,
      );
    }
    await tx.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}
