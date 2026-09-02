import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SegmentsService } from './segments.service';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  SegmentPreviewQuery,
} from './dto/segments.dto';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.segments.list(q.page, q.limit);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateSegmentDto) {
    return this.segments.create(tenantId, dto);
  }

  @Get(':id/preview')
  preview(@Param('id') id: string, @Query() q: SegmentPreviewQuery) {
    return this.segments.preview(id, q.page, q.limit);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.segments.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.segments.remove(id);
  }
}