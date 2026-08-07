import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { TagsService } from './tags.service';
import { SuppressionsService } from './suppressions.service';
import { CreateTagDto, CreateSuppressionDto } from './dto/tags-suppressions.dto';

@Controller()
export class TagsController {
  constructor(
    private readonly tags: TagsService,
    private readonly suppressions: SuppressionsService,
  ) {}

  @Get('tags')
  listTags() {
    return this.tags.list();
  }

  @Post('tags')
  createTag(@TenantId() tenantId: string, @Body() dto: CreateTagDto) {
    return this.tags.create(tenantId, dto.name);
  }

  @Delete('tags/:id')
  removeTag(@Param('id') id: string) {
    return this.tags.remove(id);
  }

  @Get('suppressions')
  listSuppressions() {
    return this.suppressions.list();
  }

  @Post('suppressions')
  createSuppression(@TenantId() tenantId: string, @Body() dto: CreateSuppressionDto) {
    return this.suppressions.create(tenantId, dto.email, dto.reason);
  }

  @Delete('suppressions/:id')
  removeSuppression(@Param('id') id: string) {
    return this.suppressions.remove(id);
  }
}