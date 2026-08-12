import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsPublicController } from './forms-public.controller';
import { FormsService } from './forms.service';
import { FormsSubmissionsService } from './forms-submissions.service';

/**
 * Forms (Step 14).
 *
 * PrismaModule is @Global — no import needed. EventEmitterModule.forRoot() is
 * registered in AppModule, so EventEmitter2 is injectable app-wide.
 *
 * Two controllers on purpose:
 *   - FormsController (auth'd admin CRUD, mounted at /api/forms)
 *   - FormsPublicController (@Public submit, mounted at /api/public/forms)
 * ...so we never share a base path between the auth'd and unauth'd routes.
 */
@Module({
  controllers: [FormsController, FormsPublicController],
  providers: [FormsService, FormsSubmissionsService],
  exports: [FormsService],
})
export class FormsModule {}