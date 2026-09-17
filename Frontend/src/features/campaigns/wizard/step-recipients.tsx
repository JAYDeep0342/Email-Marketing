import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useListsList } from '@/features/lists/use-lists';
import { useSegmentsList } from '@/features/segments/use-segments';
import { useSegmentPreview } from '@/features/segments/use-segments';
import type { TargetSelection } from './wizard-types';

interface StepRecipientsProps {
  value: TargetSelection | null;
  onChange: (value: TargetSelection) => void;
}

// One row per segment — each fetches its own match count via the existing
// GET /segments/:id/preview?limit=1 (meta.total). No count is returned by
// GET /segments itself (see segments.service.ts), and this stays cheap: it's
// bounded by how many segments a tenant has, not by page size of a big list.
function SegmentRow({
  id,
  name,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  selected: boolean;
  onSelect: (count: number) => void;
}) {
  const { meta, isLoading } = useSegmentPreview(id, { page: 1, limit: 1 });
  const count = meta?.total ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(count)}
      className={cn(
        'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
      )}
    >
      <span className="font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">
        {isLoading ? 'Counting…' : `${count.toLocaleString()} match${count === 1 ? '' : 'es'}`}
      </span>
    </button>
  );
}

export function StepRecipients({ value, onChange }: StepRecipientsProps) {
  const listsQuery = useListsList({ page: 1, limit: 100 });
  const segmentsQuery = useSegmentsList({ page: 1, limit: 100 });
  const mode = value?.type ?? 'list';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Who should receive this?</h2>
        <p className="text-sm text-muted-foreground">
          Pick one mailing list or one segment as this campaign's audience.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (mode !== 'list') onChange({ type: 'list', id: '', name: '', count: 0 });
          }}
        >
          Mailing list
        </Button>
        <Button
          type="button"
          variant={mode === 'segment' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (mode !== 'segment') onChange({ type: 'segment', id: '', name: '', count: 0 });
          }}
        >
          Segment
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          {mode === 'list' ? (
            listsQuery.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading lists…</p>
            ) : listsQuery.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No mailing lists yet — create one first.
              </p>
            ) : (
              listsQuery.rows.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onChange({ type: 'list', id: l.id, name: l.name, count: l.contactCount })}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition-colors',
                    value?.id === l.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.contactCount.toLocaleString()} subscriber{l.contactCount === 1 ? '' : 's'}
                  </span>
                </button>
              ))
            )
          ) : segmentsQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading segments…</p>
          ) : segmentsQuery.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No segments yet — create one first.
            </p>
          ) : (
            segmentsQuery.rows.map((s) => (
              <SegmentRow
                key={s.id}
                id={s.id}
                name={s.name}
                selected={value?.id === s.id}
                onSelect={(count) => onChange({ type: 'segment', id: s.id, name: s.name, count })}
              />
            ))
          )}
        </CardContent>
      </Card>

      {value?.id && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span className="font-medium text-foreground">{value.count.toLocaleString()}</span> people
          will be targeted (before unsubscribes/suppression are applied at send time).
        </p>
      )}
    </div>
  );
}
