import { useState } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { normalizeAxiosError } from '@/lib/api';
import { CampaignFormDialog } from '@/features/campaigns/campaign-form-dialog';
import { CampaignPreviewDialog } from '@/features/campaigns/campaign-preview-dialog';
import { CampaignRecipient, CampaignStatus } from '@/features/campaigns/campaigns.api';
import { DeleteCampaignDialog } from '@/features/campaigns/delete-campaign-dialog';
import { ScheduleCampaignDialog } from '@/features/campaigns/schedule-campaign-dialog';
import {
  useCampaign,
  useCampaignAnalytics,
  useCampaignTimeline,
  useCancelCampaign,
  usePauseCampaign,
  useRecipients,
  useRemoveRecipient,
  useResolveRecipients,
  useResumeCampaign,
  useUnscheduleCampaign,
} from '@/features/campaigns/use-campaigns';

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

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const campaignId = id!;
  const navigate = useNavigate();

  const { data: campaign, isLoading, isError, error } = useCampaign(campaignId);
  const [page, setPage] = useState(1);
  const recipientsQuery = useRecipients(campaignId, { page, limit: PAGE_SIZE });
  const analyticsQuery = useCampaignAnalytics(campaignId);
  const timelineQuery = useCampaignTimeline(campaignId);

  const resolveMutation = useResolveRecipients(campaignId);
  const removeRecipientMutation = useRemoveRecipient(campaignId);
  const unscheduleMutation = useUnscheduleCampaign(campaignId);
  const pauseMutation = usePauseCampaign(campaignId);
  const resumeMutation = useResumeCampaign(campaignId);
  const cancelMutation = useCancelCampaign(campaignId);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // No backend field distinguishes "never resolved" from "resolved, 0
  // matched" — this session-local flag covers the case that actually
  // prompted the fix (click Resolve, see the stale "never run" message).
  const [hasResolvedInSession, setHasResolvedInSession] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !campaign) {
    return (
      <p className="text-sm text-destructive">
        {error ? normalizeAxiosError(error).message : 'Campaign not found.'}
      </p>
    );
  }

  const recipientColumns: DataTableColumn<CampaignRecipient>[] = [
    { key: 'email', header: 'Email', cell: (r) => r.email ?? '—' },
    {
      key: 'name',
      header: 'Name',
      cell: (r) => [r.firstName, r.lastName].filter(Boolean).join(' ') || '—',
    },
    { key: 'status', header: 'Status', cell: (r) => r.status ?? '—' },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeRecipientMutation.mutate(r.contactId)}
          disabled={removeRecipientMutation.isPending}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/campaigns"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{campaign.status}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={campaign.status !== 'draft' && campaign.status !== 'paused'}
              title={
                campaign.status !== 'draft' && campaign.status !== 'paused'
                  ? `Cannot edit a campaign with status '${campaign.status}'`
                  : undefined
              }
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={campaign.status === 'sending'}
              title={campaign.status === 'sending' ? 'Cannot delete while sending' : undefined}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subject" value={campaign.subject} />
            <Row label="Preheader" value={campaign.preheader ?? '—'} />
            <Row
              label="Sender"
              value={
                campaign.signature
                  ? `${campaign.signature.name} <${campaign.signature.fromEmail}>${
                      campaign.signature.isVerified ? '' : ' (unverified)'
                    }`
                  : campaign.fromName && campaign.fromEmail
                    ? `${campaign.fromName} <${campaign.fromEmail}>`
                    : '— not set —'
              }
            />
            <Row label="Template" value={campaign.template?.name ?? '— none —'} />
            <Row
              label="Audience"
              value={
                campaign.list?.name
                  ? `List: ${campaign.list.name}`
                  : campaign.segment?.name
                    ? `Segment: ${campaign.segment.name}`
                    : '— not set —'
              }
            />
            <Row label="Recipients" value={String(campaign.recipientCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Status actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaign.status === 'draft' && (
              <Button onClick={() => setScheduleOpen(true)} className="w-full">
                Schedule
              </Button>
            )}
            {campaign.status === 'scheduled' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Scheduled for{' '}
                  {campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : '—'}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => unscheduleMutation.mutate()}
                    disabled={unscheduleMutation.isPending}
                  >
                    Unschedule
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending}
                  >
                    Pause
                  </Button>
                </div>
              </>
            )}
            {campaign.status === 'paused' && (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                >
                  Resume
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            )}
            {(campaign.status === 'sending' ||
              campaign.status === 'sent' ||
              campaign.status === 'cancelled') && (
              <p className="text-sm text-muted-foreground">
                {campaign.status === 'sent' && campaign.sentAt
                  ? `Sent on ${new Date(campaign.sentAt).toLocaleString()}.`
                  : campaign.status === 'sending'
                    ? 'Currently sending — recipients cannot be changed.'
                    : 'This campaign was cancelled.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-medium">
            Recipients {recipientsQuery.meta ? `(${recipientsQuery.meta.total})` : ''}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              resolveMutation.mutate(undefined, {
                onSuccess: () => setHasResolvedInSession(true),
              })
            }
            disabled={resolveMutation.isPending || campaign.status === 'sending' || campaign.status === 'sent'}
          >
            {resolveMutation.isPending ? 'Resolving…' : 'Resolve Recipients'}
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={recipientColumns}
            rows={recipientsQuery.rows}
            rowKey={(r) => r.contactId}
            isLoading={recipientsQuery.isLoading}
            isFetching={recipientsQuery.isFetching}
            isError={recipientsQuery.isError}
            errorMessage={
              recipientsQuery.error
                ? normalizeAxiosError(recipientsQuery.error).message
                : undefined
            }
            emptyMessage={
              hasResolvedInSession
                ? 'No recipients matched (0 resolved) — check the target list/segment.'
                : 'No recipients resolved yet — click Resolve Recipients.'
            }
            meta={recipientsQuery.meta}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {analyticsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {analyticsQuery.isError && (
            <p className="text-sm text-destructive">Couldn't load stats.</p>
          )}
          {analyticsQuery.data && (
            <>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
                <Stat label="Recipients" value={analyticsQuery.data.totals.totalRecipients} />
                <Stat label="Sent" value={analyticsQuery.data.totals.sent} />
                <Stat label="Delivered" value={analyticsQuery.data.totals.delivered} />
                <Stat label="Opens" value={analyticsQuery.data.totals.opens} />
                <Stat label="Clicks" value={analyticsQuery.data.totals.clicks} />
                <Stat label="Bounces" value={analyticsQuery.data.totals.bounces} />
                <Stat label="Complaints" value={analyticsQuery.data.totals.complaints} />
                <Stat label="Unsubscribes" value={analyticsQuery.data.totals.unsubscribes} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 border-t border-border pt-4">
                <Stat label="Delivery rate" value={`${analyticsQuery.data.rates.deliveryRate}%`} />
                <Stat label="Open rate" value={`${analyticsQuery.data.rates.openRate}%`} />
                <Stat label="Click rate" value={`${analyticsQuery.data.rates.clickRate}%`} />
                <Stat label="Bounce rate" value={`${analyticsQuery.data.rates.bounceRate}%`} />
                <Stat label="Complaint rate" value={`${analyticsQuery.data.rates.complaintRate}%`} />
              </div>
            </>
          )}

          {timelineQuery.data && timelineQuery.data.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Activity timeline</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timelineQuery.data.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(row.day).toLocaleDateString()}</TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignFormDialog open={editOpen} onOpenChange={setEditOpen} campaign={campaign} />

      <DeleteCampaignDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        campaign={campaign}
        onDeleted={() => navigate('/app/campaigns')}
      />

      <ScheduleCampaignDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        campaignId={campaignId}
      />

      <CampaignPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        campaignId={campaignId}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
