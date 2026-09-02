import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { Segment, SegmentPreviewContact } from './segments.api';
import { useSegmentPreview } from './use-segments';

interface PreviewSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: Segment | null;
}

const PAGE_SIZE = 10;

export function PreviewSegmentDialog({ open, onOpenChange, segment }: PreviewSegmentDialogProps) {
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, isFetching, isError, error } = useSegmentPreview(segment?.id ?? "", {
    page,
    limit: PAGE_SIZE,
  });

  const columns: DataTableColumn<SegmentPreviewContact>[] = [
    { key: 'email', header: 'Email', cell: (c) => c.email },
    {
      key: 'name',
      header: 'Name',
      cell: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
    },
    { key: 'status', header: 'Status', cell: (c) => <Badge variant="secondary">{c.status}</Badge> },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) setPage(1);
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview: {segment?.name}</DialogTitle>
          <DialogDescription>
            Contacts currently matching this segment's rules.
          </DialogDescription>
        </DialogHeader>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          errorMessage={error ? normalizeAxiosError(error).message : undefined}
          emptyMessage="No contacts match this segment yet."
          meta={meta}
          onPageChange={setPage}
        />
      </DialogContent>
    </Dialog>
  );
}
