import { Copy, Eye, MoreVertical, PenLine, SquarePen, Trash2, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils';
import { Template } from './templates.api';
import { TemplateThumbnail } from './template-thumbnail';

interface TemplateCardProps {
  template: Template;
  categoryName?: string;
  onPreview: (t: Template) => void;
  onEditHtml: (t: Template) => void;
  onRename: (t: Template) => void;
  onDelete: (t: Template) => void;
  onDuplicate: (id: string) => void;
  duplicating: boolean;
}

export function TemplateCard({
  template: t,
  categoryName,
  onPreview,
  onEditHtml,
  onRename,
  onDelete,
  onDuplicate,
  duplicating,
}: TemplateCardProps) {
  const navigate = useNavigate();
  const openBuilder = () => navigate(`/app/templates/${t.id}/builder`);

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <div className="relative border-b border-border">
        <TemplateThumbnail html={t.renderedHtml} />
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
          <Button type="button" variant="secondary" size="sm" onClick={() => onPreview(t)}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button type="button" size="sm" onClick={t.isGallery ? () => onDuplicate(t.id) : openBuilder}>
            {t.isGallery ? (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </>
            ) : (
              <>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium" title={t.name}>
            {t.name}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1 -mt-1">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openBuilder}>
                <Wand2 className="h-4 w-4" />
                Open builder
              </DropdownMenuItem>
              {!t.isGallery && (
                <DropdownMenuItem onClick={() => onEditHtml(t)}>
                  <SquarePen className="h-4 w-4" />
                  Edit HTML
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onPreview(t)}>
                <Eye className="h-4 w-4" />
                Preview
              </DropdownMenuItem>
              {!t.isGallery && (
                <DropdownMenuItem onClick={() => onRename(t)}>
                  <PenLine className="h-4 w-4" />
                  Rename
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onDuplicate(t.id)} disabled={duplicating}>
                <Copy className="h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              {!t.isGallery && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {t.isGallery && (
            <Badge variant="outline" className="text-[10px]">
              Gallery
            </Badge>
          )}
          {categoryName && (
            <Badge variant="secondary" className="text-[10px]">
              {categoryName}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(t.updatedAt)}</p>
      </div>
    </div>
  );
}
