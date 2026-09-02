import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Restricts a route to platform admins only (BUG #3). Checks the current
 * user's `isPlatformAdmin` flag fresh from the DB on every request — no JWT
 * changes, so a flag flip takes effect immediately without re-login.
 *
 * Applied only to AdminPlansController; the public PlansController is
 * untouched. Runs after JwtAuthGuard (global), so request.user is populated.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id as string | undefined;
    const tenantId = request.user?.tenantId as string | undefined;
    if (!userId || !tenantId) {
      throw new ForbiddenException('Platform admin access required');
    }

    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: { id: userId },
        select: { isPlatformAdmin: true },
      }),
    );

    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
