import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCancelSubscription } from './use-billing';

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string | undefined;
}

/** Same shape as the delete-*-dialog components elsewhere (contacts, lists,
 * campaigns, ...) — a confirm step in front of a destructive mutation. */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  planName,
}: CancelSubscriptionDialogProps) {
  const cancelMutation = useCancelSubscription();

  const handleCancel = async () => {
    await cancelMutation.mutateAsync();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel{' '}
            <span className="font-medium text-foreground">{planName ?? 'your plan'}</span>?
            You'll keep access until the end of the current billing period, then it won't
            renew.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep subscription
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? 'Cancelling…' : 'Cancel subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
