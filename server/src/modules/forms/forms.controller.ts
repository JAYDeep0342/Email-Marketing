import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { FormsService } from './forms.service';
import { CreateFormDto, UpdateFormDto } from './dto/forms.dto';

/**
 * Admin CRUD. Auth'd via the global JwtAuthGuard; tenant comes from CLS.
 * All endpoints are RLS-scoped by construction (service uses withCurrentTenant).
 */
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateFormDto) {
    return this.forms.create(tenantId, dto);
  }

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.forms.list(page, limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.forms.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.forms.remove(id);
  }

  @Get(':id/submissions')
  listSubmissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.forms.listSubmissions(id, page, limit);
  }
}