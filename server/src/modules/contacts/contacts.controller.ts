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
import { ContactsService } from './contacts.service';
import {
  CreateContactDto,
  UpdateContactDto,
  ListContactsQueryDto,
  ImportContactsDto,
  AddTagDto,
} from './dto/contacts.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(tenantId, dto);
  }

  @Get()
  list(@Query() q: ListContactsQueryDto) {
    return this.contacts.list(q);
  }

  @Post('import')
  import(@TenantId() tenantId: string, @Body() dto: ImportContactsDto) {
    return this.contacts.import(tenantId, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contacts.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contacts.remove(id);
  }

  @Post(':id/tags')
  @HttpCode(200)
  addTag(@Param('id') id: string, @Body() dto: AddTagDto) {
    return this.contacts.addTag(id, dto.tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(@Param('id') id: string, @Param('tagId') tagId: string) {
    return this.contacts.removeTag(id, tagId);
  }
}
