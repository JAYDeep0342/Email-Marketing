import {
  Body,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CheckQuota } from '../billing/decorators/plan-gating.decorators';
import { ContactsService } from './contacts.service';
import {
  CreateContactDto,
  UpdateContactDto,
  ListContactsQueryDto,
  ImportContactsDto,
  AddTagDto,
} from './dto/contacts.dto';

// Guards run BEFORE ValidationPipe, so at this point request.body is still
// the raw parsed JSON, not an ImportContactsDto instance — reading
// .contacts.length here is the only way to know the batch size at gate time.
// This is a conservative count (pre-dedup/pre-validation), same tradeoff as
// checking any other batch operation before doing the work: it can reject an
// import that would've fit after dedup, but it can never let one exceed quota.
const importBatchSize = (ctx: ExecutionContext): number =>
  ctx.switchToHttp().getRequest().body?.contacts?.length ?? 0;

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @CheckQuota('contacts')
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(tenantId, dto);
  }

  @Get()
  list(@Query() q: ListContactsQueryDto) {
    return this.contacts.list(q);
  }

  @CheckQuota('contacts', importBatchSize)
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
