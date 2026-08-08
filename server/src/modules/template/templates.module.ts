import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { CategoriesService } from './categories.service';
import { TemplatesService } from './templates.service';
import { SignaturesService } from './signatures.service';
import { FormTemplatesService } from './form-templates.service';

@Module({
  controllers: [TemplatesController],
  providers: [
    CategoriesService,
    TemplatesService,
    SignaturesService,
    FormTemplatesService,
  ],
  exports: [TemplatesService, SignaturesService],
})
export class TemplatesModule {}