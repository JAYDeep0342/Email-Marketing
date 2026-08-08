import { Module } from '@nestjs/common';
import { SegmentsModule } from '../segments/segments.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignRecipientsService } from './campaign-recipients.service';

@Module({
  // SegmentsModule must export SegmentsService (patched in Step 11) — the
  // audience resolver reuses its whitelisted rule->where builder instead of
  // duplicating that security-sensitive logic.
  imports: [SegmentsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRecipientsService],
  // Exported for the Sending Engine (Step 12), which will read campaigns and
  // their recipient snapshots to build email_jobs.
  exports: [CampaignsService, CampaignRecipientsService],
})
export class CampaignsModule {}