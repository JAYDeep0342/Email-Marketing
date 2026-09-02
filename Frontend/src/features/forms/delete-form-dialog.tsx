import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDeleteForm } from './use-forms';

interface DeleteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { id: string; name: string } | null;
  onDeleted?: () => void;
}

export function DeleteFormDialog({ open, onOpenChange, form, onDeleted }: DeleteFormDialogProps) {
  const deleteMutation = useDeleteForm();

  const handleDelete = async () => {
    if (!form) return;
    await deleteMutation.mutateAsync(form.id);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete form</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">{form?.name}</span>? Its
            submissions will be deleted too. This can't be undone.
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
