import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

// If a service returns { data, meta }, we lift meta to the top level.
// Otherwise the whole return value becomes `data`.
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    // Allow specific endpoints (e.g. webhooks) to opt out of wrapping
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((payload): ApiResponse<T> | T => {
        if (isRaw) return payload;

        // Support services returning { data, meta } for pagination
        if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload
        ) {
          const p = payload as { data: T; meta: Record<string, unknown> };
          return {
            success: true as const,
            data: p.data,
            meta: p.meta,
          };
        }

        return { success: true as const, data: payload };
      }),
    );
  }
}
