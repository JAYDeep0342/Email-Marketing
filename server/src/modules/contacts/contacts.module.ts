import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { SuppressionsService } from './suppressions.service';

@Module({
  controllers: [ContactsController, TagsController],
  providers: [ContactsService, TagsService, SuppressionsService],
  exports: [ContactsService],
})
export class ContactsModule {}