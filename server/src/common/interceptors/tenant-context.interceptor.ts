import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';

export const CLS_TENANT_ID = 'tenantId';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    // Auth guard (Step 7) will set request.tenantId from the JWT.
    // Until then this is simply undefined for unauthenticated routes.
    const tenantId = request.tenantId as string | undefined;
    if (tenantId) {
      this.cls.set(CLS_TENANT_ID, tenantId);
    }
    return next.handle();
  }
}
