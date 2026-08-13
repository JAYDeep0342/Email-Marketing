import {
  Body,
  Controller,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { FormsSubmissionsService } from './forms-submissions.service';
import { SubmitFormDto } from './dto/forms.dto';

/**
 * Public form submit. No auth, no tenant on the request — the formId in the
 * path is the credential. FormsSubmissionsService resolves the owning tenant
 * via the form_public_lookup SECURITY DEFINER function (see migration).
 *
 * Mounted at /api/public/forms/:formId/submissions so it can't collide with
 * the admin routes at /api/forms/*.
 */
@Controller('public/forms')
export class FormsPublicController {
  constructor(private readonly submissions: FormsSubmissionsService) {}

  @Public()
  @Post(':formId/submissions')
  @HttpCode(201)
  submit(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: SubmitFormDto,
    @Ip() ip: string,
  ) {
    // Nest's @Ip() returns the raw remote address. If a proxy is in front
    // (Nginx / Cloudflare), the app should have `trust proxy` set — that's
    // an app-wide config concern, not this endpoint's.
    return this.submissions.submit(formId, dto, ip || null);
  }
}