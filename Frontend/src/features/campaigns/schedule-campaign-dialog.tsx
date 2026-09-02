import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScheduleCampaign } from './use-campaigns';

interface ScheduleCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

// datetime-local gives local time with no timezone suffix — convert to a
// real ISO string (UTC) before sending, since ScheduleCampaignDto expects
// @IsDateString() (ISO-8601).
function toIsoString(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

export function ScheduleCampaignDialog({
  open,
  onOpenChange,
  campaignId,
}: ScheduleCampaignDialogProps) {
  const [when, setWhen] = useState('');
  const scheduleMutation = useScheduleCampaign(campaignId);

  const handleSchedule = async () => {
    if (!when) return;
    await scheduleMutation.mutateAsync(toIsoString(when));
    onOpenChange(false);
    setWhen('');
  };

  // Backend requires scheduledAt strictly in the future — floor the picker
  // at "now" so an obviously-invalid pick isn't even offered.
  const minLocal = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule campaign</DialogTitle>
          <DialogDescription>
            Pick a future date/time. The dispatcher polls every 60s and sends once it's due.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="scheduledAt">Send at</Label>
          <Input
            id="scheduledAt"
            type="datetime-local"
            min={minLocal}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSchedule}
            disabled={!when || scheduleMutation.isPending}
          >
            {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
