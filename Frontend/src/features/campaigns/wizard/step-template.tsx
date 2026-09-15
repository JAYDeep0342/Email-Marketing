import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form.field';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTemplatesList } from '@/features/templates/use-templates';
import type { TemplateDraft } from './wizard-types';

const NONE = '__none__';

interface StepTemplateProps {
  value: TemplateDraft;
  onChange: (value: TemplateDraft) => void;
}

export function StepTemplate({ value, onChange }: StepTemplateProps) {
  const templatesQuery = useTemplatesList({ page: 1, limit: 100 });
  const html = value.mode === 'custom' ? value.customHtml : value.existing?.html ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Choose a template</h2>
        <p className="text-sm text-muted-foreground">
          Pick an existing template or paste your own HTML.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={value.mode === 'existing' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ ...value, mode: 'existing' })}
        >
          Existing template
        </Button>
        <Button
          type="button"
          variant={value.mode === 'custom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange({ ...value, mode: 'custom' })}
        >
          Paste custom HTML
        </Button>
      </div>

      {value.mode === 'existing' ? (
        <div className="space-y-1.5">
          <Label>Template</Label>
          <Select
            value={value.existing?.id || NONE}
            onValueChange={(v) => {
              if (v === NONE) {
                onChange({ ...value, existing: null });
                return;
              }
              const t = templatesQuery.rows.find((row) => row.id === v);
              if (t) onChange({ ...value, existing: { id: t.id, name: t.name, html: t.renderedHtml } });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="No template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No template</SelectItem>
              {templatesQuery.rows.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-3">
          <FormField
            label="Template name"
            value={value.customName}
            onChange={(e) => onChange({ ...value, customName: e.target.value })}
            placeholder="e.g. September newsletter (custom)"
          />
          <div className="space-y-1.5">
            <Label>HTML</Label>
            <Textarea
              value={value.customHtml}
              onChange={(e) => onChange({ ...value, customHtml: e.target.value })}
              placeholder="<html>…</html>"
              className="min-h-[160px] font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This will be saved as a new template ({value.customName || 'untitled'}) when you
            continue.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Preview</Label>
        <Card>
          <CardContent className="p-0">
            {html ? (
              <iframe
                title="Template preview"
                sandbox=""
                srcDoc={html}
                className="h-72 w-full rounded-md bg-white"
              />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing to preview yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
