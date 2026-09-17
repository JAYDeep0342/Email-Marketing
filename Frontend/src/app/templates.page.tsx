import { useEffect, useState } from 'react';
import { Copy, LayoutGrid, List as ListIcon, Plus, Search, Wand2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { normalizeAxiosError } from '@/lib/api';
import { DeleteTemplateDialog } from '@/features/templates/delete-template-dialog';
import { RenameTemplateDialog } from '@/features/templates/rename-template-dialog';
import { TemplateCard } from '@/features/templates/template-card';
import { TemplateDialog } from '@/features/templates/template-dialog';
import { TemplatePreviewDialog } from '@/features/templates/template-preview-dialog';
import { Template } from '@/features/templates/templates.api';
import { useDuplicateTemplate, useTemplateCategories, useTemplatesList } from '@/features/templates/use-templates';

const PAGE_SIZE = 20;
const ALL_CATEGORIES = '__all__';

type ViewMode = 'grid' | 'list';

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="h-40 w-full animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { rows, meta, isLoading, isFetching, isError, error } = useTemplatesList({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    categoryId: categoryId === ALL_CATEGORIES ? undefined : categoryId,
  });
  const categoriesQuery = useTemplateCategories();
  const categoryNameById = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name]));

  const duplicateMutation = useDuplicateTemplate();

  const [addOpen, setAddOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<Template | null>(null);
  const [renamingTemplate, setRenamingTemplate] = useState<Template | null>(null);

  const isFiltered = !!search || categoryId !== ALL_CATEGORIES;

  const columns: DataTableColumn<Template>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (t) =>
        t.isGallery ? (
          <span className="font-medium">{t.name}</span>
        ) : (
          <button
            type="button"
            onClick={() => setEditingTemplate(t)}
            className="font-medium text-foreground hover:text-primary hover:underline"
          >
            {t.name}
          </button>
        ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.isGallery && <Badge variant="outline">Gallery</Badge>}
          {t.categoryId && (
            <Badge variant="secondary">{categoryNameById.get(t.categoryId) ?? '—'}</Badge>
          )}
          {!t.isGallery && !t.categoryId && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      cell: (t) => new Date(t.updatedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (t) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/app/templates/${t.id}/builder`)}>
            <Wand2 className="mr-1 h-3.5 w-3.5" />
            Open builder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateMutation.mutate(t.id)}
            disabled={duplicateMutation.isPending}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Duplicate
          </Button>
          {!t.isGallery && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(t)}>
                Edit HTML
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeletingTemplate(t)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Build emails that convert</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Start from a polished template or design one from scratch with the visual builder.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">{meta?.total ?? '—'}</p>
              <p className="text-xs text-muted-foreground">templates</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/app/templates/new/builder')}>
                <Wand2 className="mr-2 h-4 w-4" />
                Design Visually
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <CardTitle className="text-base font-medium">All templates</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-56 pl-8"
              />
            </div>
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {(categoriesQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-input p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid view"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-sm transition-colors',
                  view === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-sm transition-colors',
                  view === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {view === 'list' ? (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(t) => t.id}
              isLoading={isLoading}
              isFetching={isFetching}
              isError={isError}
              errorMessage={error ? normalizeAxiosError(error).message : undefined}
              emptyMessage={
                isFiltered ? 'No templates match your search.' : 'No templates yet — create your first one.'
              }
              meta={meta}
              onPageChange={setPage}
            />
          ) : (
            <div className="space-y-4">
              {isError ? (
                <p className="py-12 text-center text-sm text-destructive">
                  {error ? normalizeAxiosError(error).message : 'Something went wrong loading templates.'}
                </p>
              ) : isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {isFiltered
                    ? 'No templates match your search.'
                    : 'No templates yet — create your first one.'}
                </p>
              ) : (
                <div
                  className={cn(
                    'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity',
                    isFetching && 'opacity-60',
                  )}
                >
                  {rows.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      categoryName={t.categoryId ? categoryNameById.get(t.categoryId) : undefined}
                      onPreview={setPreviewingTemplate}
                      onEditHtml={setEditingTemplate}
                      onRename={setRenamingTemplate}
                      onDelete={setDeletingTemplate}
                      onDuplicate={(id) => duplicateMutation.mutate(id)}
                      duplicating={duplicateMutation.isPending}
                    />
                  ))}
                </div>
              )}

              {meta && meta.pages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {meta.page} of {meta.pages} &middot; {meta.total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page <= 1}
                      onClick={() => setPage(meta.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page >= meta.pages}
                      onClick={() => setPage(meta.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateDialog key="create" open={addOpen} onOpenChange={setAddOpen} />

      <TemplateDialog
        key={editingTemplate?.id ?? 'edit-empty'}
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
        template={editingTemplate}
      />

      <DeleteTemplateDialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && setDeletingTemplate(null)}
        template={deletingTemplate}
      />

      <TemplatePreviewDialog
        open={!!previewingTemplate}
        onOpenChange={(open) => !open && setPreviewingTemplate(null)}
        template={previewingTemplate}
      />

      <RenameTemplateDialog
        open={!!renamingTemplate}
        onOpenChange={(open) => !open && setRenamingTemplate(null)}
        template={renamingTemplate}
      />
    </div>
  );
}
