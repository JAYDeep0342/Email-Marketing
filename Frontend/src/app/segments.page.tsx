import { useState } from 'react';
import { Eye, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { normalizeAxiosError } from '@/lib/api';
import { DeleteSegmentDialog } from '@/features/segments/delete-segment-dialog';
import { PreviewSegmentDialog } from '@/features/segments/preview-segment-dialog';
import { SegmentDialog } from '@/features/segments/segment-dialog';
import { Segment } from '@/features/segments/segments.api';
import { useSegmentsList } from '@/features/segments/use-segments';

const PAGE_SIZE = 20;

export default function SegmentsPage() {
  const [page, setPage] = useState(1);
  const { rows, meta, isLoading, isFetching, isError, error } = useSegmentsList({ page, limit: PAGE_SIZE });

  const [addOpen, setAddOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [deletingSegment, setDeletingSegment] = useState<Segment | null>(null);
  const [previewingSegment, setPreviewingSegment] = useState<Segment | null>(null);

  const columns: DataTableColumn<Segment>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (s) => (
        <button
          type="button"
          onClick={() => setEditingSegment(s)}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {s.name}
        </button>
      ),
    },
    {
      key: 'match',
      header: 'Match',
      cell: (s) => (
        <Badge variant="secondary">{s.rules?.match === 'all' ? 'All (AND)' : 'Any (OR)'}</Badge>
      ),
    },
    {
      key: 'conditions',
      header: 'Conditions',
      // rules is a scalar JSON column on Segment itself (not a separate
      // relation like Automation.steps), so it's always present — this is
      // just cheap defensive insurance, not a fix for a known missing field.
      cell: (s) => s.rules?.conditions?.length ?? 0,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (s) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPreviewingSegment(s)}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditingSegment(s)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingSegment(s)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Segments</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Segment
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium">All segments</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No segments yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <SegmentDialog key="create" open={addOpen} onOpenChange={setAddOpen} />

      <SegmentDialog
        key={editingSegment?.id ?? 'edit-empty'}
        open={!!editingSegment}
        onOpenChange={(open) => !open && setEditingSegment(null)}
        segment={editingSegment}
      />

      <DeleteSegmentDialog
        open={!!deletingSegment}
        onOpenChange={(open) => !open && setDeletingSegment(null)}
        segment={deletingSegment}
      />

      <PreviewSegmentDialog
        open={!!previewingSegment}
        onOpenChange={(open) => !open && setPreviewingSegment(null)}
        segment={previewingSegment}
      />
    </div>
  );
}
