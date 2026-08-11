import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  decodeTrackingToken,
  verifyUrlSignature,
} from '../../common/utils/signed-token.util';
import { TrackingEventsService } from './tracking-events.service';

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/**
 * Public open/click tracking. Tokens are HMAC-signed and self-contained (no DB
 * lookup to resolve identity). @Public() opens these past the global guard.
 *
 * Design choice: tracking effects are fire-and-forget — the pixel/redirect
 * response is returned immediately and the DB write is not awaited on the hot
 * path, so a slow/failed write can never break email rendering or a user's
 * click-through. A bad/tampered token is silently ignored (still returns the
 * pixel / a safe response) to avoid leaking anything to scanners.
 */
@Controller('t')
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(private readonly events: TrackingEventsService) {}

  @Public()
  @Get('o/:token')
  open(@Param('token') token: string, @Res() res: Response) {
    const id = decodeTrackingToken(token.replace(/\.gif$/, ''));
    if (id) {
      // fire-and-forget, but never silent: a systemic write failure (DB blip,
      // bad payload) must be visible in logs even though we don't fail the pixel.
      void this.events
        .apply({ type: 'open', emailJobId: id.j })
        .catch((e) =>
          this.logger.warn(`open tracking write failed: ${e?.message ?? e}`),
        );
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.end(PIXEL);
  }

  @Public()
  @Get('c/:token')
  click(
    @Param('token') token: string,
    @Query('u') url: string,
    @Query('s') sig: string,
    @Res() res: Response,
  ) {
    if (!url) throw new BadRequestException('missing target');

    // Open-redirect guard: the target must carry a valid signature we minted.
    if (!sig || !verifyUrlSignature(url, sig)) {
      throw new BadRequestException('invalid target signature');
    }

    const id = decodeTrackingToken(token);
    if (id) {
      void this.events
        .apply({ type: 'click', emailJobId: id.j, url })
        .catch((e) =>
          this.logger.warn(`click tracking write failed: ${e?.message ?? e}`),
        );
    }
    res.redirect(302, url);
  }
}
