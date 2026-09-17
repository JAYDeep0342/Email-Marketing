import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form.field';
import { Template } from './templates.api';
import { useUpdateTemplate } from './use-templates';

interface RenameTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}

export function RenameTemplateDialog({
  open,
  onOpenChange,
  template,
}: RenameTemplateDialogProps) {
  const [name, setName] = useState('');
  const updateMutation = useUpdateTemplate(template?.id);

  // Re-seed the input whenever a different template is being renamed.
  useEffect(() => {
    if (open) setName(template?.name ?? '');
  }, [open, template]);

  const handleSave = async () => {
    if (!template || !name.trim()) return;
    await updateMutation.mutateAsync({ id: template.id, name: name.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <FormField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            }
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
