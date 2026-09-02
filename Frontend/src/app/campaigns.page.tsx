import { useEffect, useState } from 'react';
import { Copy, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeAxiosError } from '@/lib/api';
import { CampaignFormDialog } from '@/features/campaigns/campaign-form-dialog';
import { CAMPAIGN_STATUSES, CampaignListItem, CampaignStatus } from '@/features/campaigns/campaigns.api';
import { DeleteCampaignDialog } from '@/features/campaigns/delete-campaign-dialog';
import { useCampaignsList, useDuplicateCampaign } from '@/features/campaigns/use-campaigns';

const STATUS_BADGE_VARIANT: Record<
  CampaignStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  scheduled: 'outline',
  sending: 'default',
  sent: 'default',
  paused: 'secondary',
  cancelled: 'destructive',
};

const PAGE_SIZE = 20;

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CampaignStatus | 'all'>('all');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { rows, meta, isLoading, isFetching, isError, error } = useCampaignsList({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
  });
  const duplicateMutation = useDuplicateCampaign();

  const [addOpen, setAddOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState<CampaignListItem | null>(null);

  const columns: DataTableColumn<CampaignListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (c) => (
        <button
          type="button"
          onClick={() => navigate(`/app/campaigns/${c.id}`)}
          className="cursor-pointer font-medium text-primary hover:underline"
        >
          {c.name}
        </button>
      ),
    },
    { key: 'subject', header: 'Subject', cell: (c) => c.subject },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => <Badge variant={STATUS_BADGE_VARIANT[c.status]}>{c.status}</Badge>,
    },
    { key: 'recipients', header: 'Recipients', cell: (c) => c.recipientCount },
    {
      key: 'when',
      header: 'Scheduled / Sent',
      cell: (c) =>
        c.sentAt
          ? new Date(c.sentAt).toLocaleString()
          : c.scheduledAt
            ? new Date(c.scheduledAt).toLocaleString()
            : '—',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateMutation.mutate(c.id)}
            disabled={duplicateMutation.isPending}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeletingCampaign(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">All campaigns</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-64 pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as CampaignStatus | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CAMPAIGN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No campaigns yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <CampaignFormDialog
        key="create"
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => navigate(`/app/campaigns/${id}`)}
      />

      <DeleteCampaignDialog
        open={!!deletingCampaign}
        onOpenChange={(open) => !open && setDeletingCampaign(null)}
        campaign={deletingCampaign}
      />
    </div>
  );
}
