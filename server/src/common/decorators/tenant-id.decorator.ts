import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId;
    if (!tenantId) {
      throw new InternalServerErrorException(
        'Tenant context is missing on the request',
      );
    }
    return tenantId as string;
  },
);
