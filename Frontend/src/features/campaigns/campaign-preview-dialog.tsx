import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCampaignPreview } from './use-campaigns';

interface CampaignPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

/**
 * Renders the resolved subject/sender + HTML body. The HTML is the tenant's
 * own authored template content (same thing that goes out to real inboxes),
 * but it's still rendered inside a sandboxed, scriptless iframe rather than
 * dangerouslySetInnerHTML on the page itself — no reason to let it run JS or
 * touch the app's DOM just to preview it.
 */
export function CampaignPreviewDialog({
  open,
  onOpenChange,
  campaignId,
}: CampaignPreviewDialogProps) {
  const { data, isLoading, isError } = useCampaignPreview(campaignId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Couldn't load the preview.</p>}

        {data && (
          <div className="space-y-3">
            <div className="space-y-1 rounded-md border border-border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">From: </span>
                {data.fromName || data.fromEmail ? (
                  <>
                    {data.fromName ?? '—'} &lt;{data.fromEmail ?? '—'}&gt;
                  </>
                ) : (
                  'Not set'
                )}
              </p>
              <p>
                <span className="text-muted-foreground">Subject: </span>
                {data.subject}
              </p>
              {data.preheader && (
                <p>
                  <span className="text-muted-foreground">Preheader: </span>
                  {data.preheader}
                </p>
              )}
            </div>
            {data.html ? (
              <iframe
                title="Campaign preview"
                sandbox=""
                srcDoc={data.html}
                className="h-96 w-full rounded-md border border-border bg-white"
              />
            ) : (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No template attached — nothing to render yet.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
