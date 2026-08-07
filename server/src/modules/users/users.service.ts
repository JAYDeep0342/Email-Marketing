import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { generateToken } from '../../common/utils/token.util';
import { paginated } from '../../common/dto/pagination.dto';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  InviteUserDto,
  UpdateUserDto,
} from './dto/users.dto';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  emailVerifiedAt: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private readonly prisma: PrismaService) {}

  // GET /users/me — full profile + tenant + roles
  async getMe(userId: string) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          ...SAFE_USER_SELECT,
          tenant: { select: { id: true, name: true, slug: true, status: true } },
          userRoles: {
            select: { role: { select: { id: true, name: true } } },
          },
        },
      });
      if (!user) throw new NotFoundException('User not found');
      const { userRoles, ...rest } = user;
      return { ...rest, roles: userRoles.map((ur) => ur.role) };
    });
  }

  // PATCH /users/me
  async updateMe(userId: string, dto: UpdateProfileDto) {
    return this.prisma.withCurrentTenant((tx) =>
      tx.user.update({
        where: { id: userId },
        data: { firstName: dto.firstName, lastName: dto.lastName },
        select: SAFE_USER_SELECT,
      }),
    );
  }

  // PATCH /users/me/password
  async changePassword(userId: string, dto: ChangePasswordDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      if (!user) throw new NotFoundException('User not found');

      const ok = await verifyPassword(dto.oldPassword, user.passwordHash);
      if (!ok) throw new BadRequestException('Current password is incorrect');

      const passwordHash = await hashPassword(dto.newPassword);
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });

      // Revoke all other sessions for security
      await tx.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return { message: 'Password changed. Please log in again.' };
    });
  }

  // GET /users — list tenant users (paginated)
  async list(page: number, limit: number) {
     return this.prisma.withCurrentTenant(async (tx) => {
        const [data, total] = await Promise.all([
        tx.user.findMany({
          select: SAFE_USER_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.user.count(),
      ]);
      return paginated(data, total, page, limit);
    });
  }

  // POST /users/invite
  async invite(tenantId: string, dto: InviteUserDto) {
    const email = dto.email.toLowerCase();

    // Global email uniqueness — use RLS-bypass function (auth lookups)
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM auth_find_user_by_email(${email})`;
    if (existing.length > 0) {
      throw new ConflictException('Email already registered');
    }

    // Temporary password (invited user resets via forgot-password, or we log a token)
    const { raw: tempToken } = generateToken(16);
    const passwordHash = await hashPassword(tempToken);

    return this.prisma.withCurrentTenant(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'invited',
        },
        select: SAFE_USER_SELECT,
      });

      if (dto.roleId) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: dto.roleId },
        });
      }

      // Console-log invite (real email later)
      this.logger.log(
        `📨 INVITE for ${email}: temp login token = ${tempToken} (user should reset password)`,
      );

      return user;
    });
  }

  // PATCH /users/:id
  async update(currentUserId: string, targetId: string, dto: UpdateUserDto) {
    return this.prisma.withCurrentTenant(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException('User not found');

      return tx.user.update({
        where: { id: targetId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: dto.status,
        },
        select: SAFE_USER_SELECT,
      });
    });
  }

  // DELETE /users/:id — deactivate (soft)
  async deactivate(currentUserId: string, targetId: string) {
    if (currentUserId === targetId) {
      throw new ForbiddenException('You cannot deactivate yourself');
    }
    return this.prisma.withCurrentTenant(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException('User not found');

      await tx.user.update({
        where: { id: targetId },
        data: { status: 'disabled' },
      });
      await tx.userSession.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { message: 'User deactivated' };
    });
  }
}