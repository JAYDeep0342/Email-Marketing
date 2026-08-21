import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { generateToken, hashToken } from '../../common/utils/token.util';
import { JwtPayload } from './types/jwt-payload.type';
import { SignupDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';
import { SubscriptionsService } from '../billing/subscriptions.service';
import { MailerService } from '../sending/mailer.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly mailer: MailerService,
  ) {}

  // ---------------- SIGNUP ----------------
  async signup(dto: SignupDto) {
    const slug = this.slugify(dto.companyName);

    // Global email check BEFORE creating a tenant, so a conflict doesn't
    // leave an orphan tenant behind. A direct SELECT on `users` would be
    // blocked by RLS here (no tenant context yet) and always return empty,
    // so we use the same SECURITY DEFINER lookup as login().
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM auth_find_user_by_email(${dto.email.toLowerCase()})`;
    if (existing.length > 0) {
      throw new ConflictException('Email already registered');
    }

    // Create tenant + first user in one transaction.
    // NOTE: we use the base client ($transaction) WITHOUT tenant scoping here,
    // because during signup there's no tenant context yet. This runs as
    // app_user; RLS on `tenants`/`users` uses `app.tenant_id` which is unset,
    // so we scope it manually to the new tenant id right after creating it.
    const newTenantId = crypto.randomUUID();

    // Pre-hash the password (outside tx to keep tx short)
    const passwordHash = await hashPassword(dto.password);

    try {
      const result = await this.prisma.withTenant(newTenantId, async (tx) => {
        const tenant = await tx.tenant.create({
          data: { id: newTenantId, name: dto.companyName, slug },
        });

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.email.toLowerCase(),
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });

        // Auto-assign the Owner system role to the first user.
        // System roles have tenant_id NULL; the roles_select RLS policy
        // allows reading them from any tenant context.
        const ownerRole = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM roles WHERE tenant_id IS NULL AND name = 'Owner' LIMIT 1`;
        if (ownerRole.length > 0) {
          await tx.userRole.create({
            data: { userId: user.id, roleId: ownerRole[0].id },
          });
        }

        return { tenant, user };
      });

      // Start the trial now that the tenant is created and committed (Step 16A).
      // Idempotent + returns null gracefully if no plan is seeded yet, so a
      // billing hiccup here can never block signup itself.
      await this.subscriptions.startTrial(result.tenant.id);

      // Generate email verification token (console-log for now)
      await this.createEmailVerification(result.user.id, result.user.email);

      const tokens = await this.issueTokens(
        result.user.id,
        result.tenant.id,
        result.user.email,
      );

      return {
        tenant: { id: result.tenant.id, name: result.tenant.name, slug },
        user: {
          id: result.user.id,
          email: result.user.email,
          emailVerified: false,
        },
        ...tokens,
      };
    } catch (e: any) {
      // Unique violation (email or slug already taken)
      if (e?.code === 'P2002') {
        throw new ConflictException('Email or company already registered');
      }
      throw e;
    }
  }

  // ---------------- LOGIN ----------------
  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const email = dto.email.toLowerCase();

    // We must find the user across tenants. Login happens BEFORE we know the
    // tenant, so a direct SELECT would be blocked by `users`' RLS policy
    // (tenant_id = app.tenant_id, which is unset here). auth_find_user_by_email
    // is a SECURITY DEFINER function that bypasses RLS for just this lookup.
    const users = await this.prisma.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        email: string;
        password_hash: string;
        status: string;
      }>
    >`SELECT * FROM auth_find_user_by_email(${email}) ORDER BY created_at ASC LIMIT 1`;

    const user = users[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await verifyPassword(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    // Update lastLoginAt (scoped to tenant)
    await this.prisma.withTenant(user.tenant_id, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    );

    const tokens = await this.issueTokens(
      user.id,
      user.tenant_id,
      user.email,
      ip,
      userAgent,
    );
    return {
      user: { id: user.id, email: user.email, tenantId: user.tenant_id },
      ...tokens,
    };
  }

  // ---------------- REFRESH ----------------
  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    const sessions = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>
    >`SELECT id, user_id, expires_at, revoked_at
      FROM user_sessions WHERE refresh_token_hash = ${tokenHash} LIMIT 1`;

    const session = sessions[0];
    if (!session || session.revoked_at || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Look up the user for the new access token (RLS-safe, see login())
    const users = await this.prisma.$queryRaw<
      Array<{ id: string; tenant_id: string; email: string }>
    >`SELECT id, tenant_id, email FROM auth_find_user_by_id(${session.user_id}::uuid)`;
    const user = users[0];
    if (!user) throw new UnauthorizedException('User not found');

    // Rotate: revoke old session, issue new tokens
    await this.prisma.withTenant(user.tenant_id, (tx) =>
      tx.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
    );

    const tokens = await this.issueTokens(user.id, user.tenant_id, user.email);
    return tokens;
  }

  // ---------------- LOGOUT ----------------
  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    // Revoke the session (raw update; token hash is unique)
    await this.prisma.$executeRaw`UPDATE user_sessions SET revoked_at = now()
        WHERE refresh_token_hash = ${tokenHash} AND revoked_at IS NULL`;
    return { message: 'Logged out' };
  }

  // ---------------- EMAIL VERIFICATION ----------------
  async verifyEmail(token: string) {
    const tokenHash = hashToken(token);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>
    >`SELECT id, user_id, expires_at, used_at
      FROM email_verification_tokens WHERE token_hash = ${tokenHash} LIMIT 1`;

    const row = rows[0];
    if (!row || row.used_at || row.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // Find the user's tenant to scope updates (RLS-safe, see login())
    const users = await this.prisma.$queryRaw<
      Array<{ tenant_id: string }>
    >`SELECT tenant_id FROM auth_find_user_by_id(${row.user_id}::uuid)`;
    const tenantId = users[0]?.tenant_id;
    if (!tenantId) throw new UnauthorizedException('User not found');

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.user.update({
        where: { id: row.user_id },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
    });

    return { message: 'Email verified successfully' };
  }

  // ---------------- FORGOT PASSWORD ----------------
  async forgotPassword(email: string) {
    const users = await this.prisma.$queryRaw<
      Array<{ id: string; tenant_id: string; email: string }>
    >`SELECT id, tenant_id, email FROM auth_find_user_by_email(${email.toLowerCase()})
      ORDER BY created_at ASC LIMIT 1`;
    const user = users[0];

    // Always return success (don't reveal whether email exists)
    if (!user) return { message: 'If the email exists, a reset link was sent' };

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.withTenant(user.tenant_id, (tx) =>
      tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hash, expiresAt },
      }),
    );

    // Console-log for now (real SMTP later)
    this.logger.log(`🔑 PASSWORD RESET for ${user.email}: token = ${raw}`);

    const resetUrl = `${this.config.get<string>('app.frontendUrl')}/auth/reset-password?token=${raw}`;
    await this.mailer.send({
      to: user.email,
      from: this.config.get<string>('mail.user') || 'no-reply@example.com',
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
    });

    return { message: 'If the email exists, a reset link was sent' };
  }

  // ---------------- RESET PASSWORD ----------------
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashToken(dto.token);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        expires_at: Date;
        used_at: Date | null;
      }>
    >`SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens WHERE token_hash = ${tokenHash} LIMIT 1`;

    const row = rows[0];
    if (!row || row.used_at || row.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const users = await this.prisma.$queryRaw<
      Array<{ tenant_id: string }>
    >`SELECT tenant_id FROM auth_find_user_by_id(${row.user_id}::uuid)`;
    const tenantId = users[0]?.tenant_id;
    if (!tenantId) throw new UnauthorizedException('User not found');

    const passwordHash = await hashPassword(dto.password);

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.user.update({
        where: { id: row.user_id },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      // Revoke all sessions on password change (security)
      await tx.userSession.updateMany({
        where: { userId: row.user_id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { message: 'Password reset successfully' };
  }

  // ---------------- HELPERS ----------------
  private async issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    ip?: string,
    userAgent?: string,
  ) {
    const payload: JwtPayload = { sub: userId, tenantId, email };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>(
        'jwt.accessExpires',
      ) as SignOptions['expiresIn'],
    });

    // Refresh token: random opaque string, store only its hash
    const { raw, hash } = generateToken();
    const refreshExpiresDays = 7;
    const expiresAt = new Date(
      Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.userSession.create({
        data: {
          userId,
          refreshTokenHash: hash,
          ipAddress: ip,
          userAgent,
          expiresAt,
        },
      }),
    );

    return { accessToken, refreshToken: raw };
  }

  private async createEmailVerification(userId: string, email: string) {
    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // We're inside signup's tenant context already gone; scope via raw insert
    await this.prisma
      .$executeRaw`INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at)
        VALUES (gen_random_uuid(), ${userId}::uuid, ${hash}, ${expiresAt}, now())`;

    this.logger.log(`📧 EMAIL VERIFICATION for ${email}: token = ${raw}`);

    const verifyUrl = `${this.config.get<string>('app.frontendUrl')}/auth/verify-email?token=${raw}`;
    await this.mailer.send({
      to: email,
      from: this.config.get<string>('mail.user') || 'no-reply@example.com',
      subject: 'Verify your email',
      html: `<p>Click the link below to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }
}
