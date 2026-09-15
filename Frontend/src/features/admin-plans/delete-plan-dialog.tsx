import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AdminPlan } from './admin-plans.api';
import { useDeletePlan } from './use-admin-plans';

interface DeletePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AdminPlan | null;
}

/**
 * The backend refuses to delete a plan that's in use by any tenant or
 * subscription (BadRequestException, surfaced via toast as-is) — deleting
 * is only safe for plans nobody has ever been on. Deactivating (the Active/
 * Inactive toggle on each row) is the usual way to retire a plan that's
 * already in use.
 */
export function DeletePlanDialog({ open, onOpenChange, plan }: DeletePlanDialogProps) {
  const deleteMutation = useDeletePlan();

  const handleDelete = async () => {
    if (!plan) return;
    await deleteMutation.mutateAsync(plan.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete plan</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">{plan?.name}</span>? This is
            only possible if no tenant or subscription has ever used it — otherwise use
            the Active/Inactive toggle instead. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
