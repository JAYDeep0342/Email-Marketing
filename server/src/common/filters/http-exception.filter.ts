import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      // Map status -> a stable machine-readable code — used as the default,
      // but an exception can carry its own more specific `code` (e.g.
      // PlanGatingGuard's NO_ACTIVE_PLAN / QUOTA_EXCEEDED / TENANT_SUSPENDED),
      // which should win over the generic per-status one.
      code = this.statusToCode(status);

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        // Nest's ValidationPipe puts messages in `message` (string or array)
        message =
          (typeof r.message === 'string' && r.message) ||
          (Array.isArray(r.message) && r.message.join(', ')) ||
          exception.message;
        if (Array.isArray(r.message)) details = r.message;
        else if (r.details !== undefined) details = r.details;
        if (typeof r.code === 'string') code = r.code;
      }
    } else if (exception instanceof Error) {
      // Unexpected error — log the full stack, but don't leak it to the client
      message = 'Internal server error';
      this.logger.error(exception.message, exception.stack);
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details ? { details } : {}) },
    };

    // Log every error line with method + path for debugging
    this.logger.warn(
      `${request.method} ${request.url} -> ${status} ${code}: ${message}`,
    );

    response.status(status).json(body);
  }

  private statusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
