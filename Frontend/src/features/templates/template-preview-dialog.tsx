import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Template } from './templates.api';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}

/**
 * Full-size preview. Unlike the campaign preview dialog, this needs no
 * fetch — the list response already carries each template's full
 * `renderedHtml`, so this just renders what's already in hand.
 */
export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
}: TemplatePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template?.name ?? 'Preview'}</DialogTitle>
        </DialogHeader>
        {template?.renderedHtml ? (
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={template.renderedHtml}
            className="h-[70vh] w-full rounded-md border border-border bg-white"
          />
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No content to preview yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
