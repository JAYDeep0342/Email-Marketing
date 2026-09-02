import { useEffect, useState } from 'react';
import { Copy, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { normalizeAxiosError } from '@/lib/api';
import { DeleteTemplateDialog } from '@/features/templates/delete-template-dialog';
import { TemplateDialog } from '@/features/templates/template-dialog';
import { Template } from '@/features/templates/templates.api';
import { useDuplicateTemplate, useTemplateCategories, useTemplatesList } from '@/features/templates/use-templates';

const PAGE_SIZE = 20;

export default function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

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
  });
  const categoriesQuery = useTemplateCategories();
  const categoryNameById = new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name]));

  const duplicateMutation = useDuplicateTemplate();

  const [addOpen, setAddOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);

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
                Edit
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">All templates</CardTitle>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64 pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(t) => t.id}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={error ? normalizeAxiosError(error).message : undefined}
            emptyMessage="No templates yet — create your first one."
            meta={meta}
            onPageChange={setPage}
          />
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
    </div>
  );
}
