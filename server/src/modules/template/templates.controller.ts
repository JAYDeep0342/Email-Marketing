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
import { CategoriesService } from './categories.service';
import { TemplatesService } from './templates.service';
import { SignaturesService } from './signatures.service';
import { FormTemplatesService } from './form-templates.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  ListTemplatesQueryDto,
  CreateSignatureDto,
  UpdateSignatureDto,
  CreateFormTemplateDto,
  UpdateFormTemplateDto,
} from './dto/templates.dto';

@Controller()
export class TemplatesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly templates: TemplatesService,
    private readonly signatures: SignaturesService,
    private readonly formTemplates: FormTemplatesService,
  ) {}

  // --- Template Categories ---
  @Get('template-categories')
  listCategories() {
    return this.categories.list();
  }
  @Post('template-categories')
  createCategory(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }
  @Patch('template-categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }
  @Delete('template-categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  // --- Templates ---
  @Get('templates')
  listTemplates(@Query() q: ListTemplatesQueryDto) {
    return this.templates.list(q);
  }
  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.templates.findOne(id);
  }
  @Post('templates')
  createTemplate(@TenantId() tenantId: string, @Body() dto: CreateTemplateDto) {
    return this.templates.create(tenantId, dto);
  }
  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }
  @Delete('templates/:id')
  removeTemplate(@Param('id') id: string) {
    return this.templates.remove(id);
  }
  @Post('templates/:id/duplicate')
  duplicateTemplate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.templates.duplicate(tenantId, id);
  }

  // --- Signatures ---
  @Get('signatures')
  listSignatures() {
    return this.signatures.list();
  }
  @Post('signatures')
  createSignature(@TenantId() tenantId: string, @Body() dto: CreateSignatureDto) {
    return this.signatures.create(tenantId, dto);
  }
  @Patch('signatures/:id')
  updateSignature(@Param('id') id: string, @Body() dto: UpdateSignatureDto) {
    return this.signatures.update(id, dto);
  }
  @Delete('signatures/:id')
  removeSignature(@Param('id') id: string) {
    return this.signatures.remove(id);
  }
  @Post('signatures/:id/verify')
  @HttpCode(200)
  verifySignature(@Param('id') id: string) {
    return this.signatures.verify(id);
  }
  @Post('signatures/:id/default')
  @HttpCode(200)
  setDefaultSignature(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.signatures.setDefault(tenantId, id);
  }

  // --- Form Templates ---
  @Get('form-templates')
  listFormTemplates() {
    return this.formTemplates.list();
  }
  @Get('form-templates/:id')
  getFormTemplate(@Param('id') id: string) {
    return this.formTemplates.findOne(id);
  }
  @Post('form-templates')
  createFormTemplate(@TenantId() tenantId: string, @Body() dto: CreateFormTemplateDto) {
    return this.formTemplates.create(tenantId, dto);
  }
  @Patch('form-templates/:id')
  updateFormTemplate(@Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.formTemplates.update(id, dto);
  }
  @Delete('form-templates/:id')
  removeFormTemplate(@Param('id') id: string) {
    return this.formTemplates.remove(id);
  }
}