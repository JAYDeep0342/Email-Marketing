import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CheckQuota } from '../billing/decorators/plan-gating.decorators';
import { ListsService } from './lists.service';
import { CreateListDto, UpdateListDto, AddContactsDto } from './dto/lists.dto';

@Controller('lists')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.lists.list(q.page, q.limit);
  }

  @CheckQuota('lists')
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateListDto) {
    return this.lists.create(tenantId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lists.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListDto) {
    return this.lists.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.lists.remove(id);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  addContacts(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddContactsDto,
  ) {
    return this.lists.addContacts(tenantId, id, dto.contactIds);
  }

  @Delete(':id/contacts/:contactId')
  removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.lists.removeContact(id, contactId);
  }

  @Get(':id/contacts')
  listContacts(@Param('id') id: string, @Query() q: PaginationDto) {
    return this.lists.listContacts(id, q.page, q.limit);
  }
}
