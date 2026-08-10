import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { UnsubscribeService } from './unsubscribe.service';

/**
 * Public one-click unsubscribe. No auth, no tenant context — the random token
 * is the credential. @Public() opens it past the global JwtAuthGuard.
 *
 * ⚠️ VERIFY the @Public import path: use the SAME decorator that opens
 * /auth/signup and /auth/login. If yours lives at a different path
 * (e.g. ../../common/decorators/public.decorator), adjust this import.
 */
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribe: UnsubscribeService) {}

  @Public()
  @Get(':token')
  consume(@Param('token') token: string) {
    return this.unsubscribe.consume(token);
  }
}