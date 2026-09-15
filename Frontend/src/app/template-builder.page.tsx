import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import grapesjs, { type Editor } from 'grapesjs';
import mjmlPlugin from 'grapesjs-mjml';
import 'grapesjs/dist/css/grapes.min.css';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeAxiosError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCreateTemplate, useTemplate, useUpdateTemplate } from '@/features/templates/use-templates';

/**
 * Visual email builder — GrapesJS + grapesjs-mjml mounted imperatively into a
 * ref'd div. GrapesJS is framework-agnostic (no React peer dependency at
 * all), so there's no React-19 compatibility question here — we just own the
 * mount/teardown lifecycle ourselves, same as any non-React widget.
 *
 * This whole page is only reachable via the lazy `templates/*\/builder`
 * routes in routes.tsx — that's what keeps GrapesJS + the MJML plugin
 * (~640KB gzip) out of the main bundle.
 */

const EMPTY_MJML = `<mjml><mj-body><mj-section><mj-column><mj-text>Start designing your email…</mj-text></mj-column></mj-section></mj-body></mjml>`;

export default function TemplateBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const traitsRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const seededRef = useRef(false);

  const [editorReady, setEditorReady] = useState(false);
  const [templateId, setTemplateId] = useState<string | undefined>(id);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const templateQuery = useTemplate(templateId ?? '');
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(templateId);

  // Mount GrapesJS exactly once; destroy on unmount. Nothing here depends on
  // props/state, so an empty dep array is correct — re-seeding content (once
  // the template loads) is handled by the separate effect below.
  //
  // blockManager/layerManager/styleManager/traitManager all get an explicit
  // `appendTo` target instead of relying on grapesjs-mjml's own top-bar
  // toggle buttons — with appendTo set, GrapesJS renders each panel directly
  // into that element on init, permanently visible, with no "open blocks"
  // button to find. This is the standard documented pattern for a custom
  // (non-default) GrapesJS layout.
  useEffect(() => {
    if (!containerRef.current) return;
    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      fromElement: false,
      storageManager: false,
      plugins: [mjmlPlugin],
      blockManager: { appendTo: blocksRef.current ?? undefined },
      layerManager: { appendTo: layersRef.current ?? undefined },
      styleManager: { appendTo: stylesRef.current ?? undefined },
      traitManager: { appendTo: traitsRef.current ?? undefined },
    });
    editorRef.current = editor;
    setEditorReady(true);
    // eslint-disable-next-line no-console -- deliberate one-time smoke check;
    // remove once drag-and-drop has been confirmed in a real browser.
    console.log('[template-builder] blocks registered:', editor.BlockManager.getAll().length);

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // Seed content once the editor exists AND (for edit mode) the template has
  // loaded. Runs at most once per mount — later edits shouldn't get clobbered
  // by a background refetch.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorReady || seededRef.current) return;

    if (isNew) {
      editor.setComponents(EMPTY_MJML);
      seededRef.current = true;
      return;
    }

    if (templateQuery.isLoading) return;
    const t = templateQuery.data;
    if (!t) return;

    setName(t.name);
    if (t.builderType === 'pro' && t.designJson) {
      // True round-trip: this is exactly what getProjectData() produced.
      editor.loadProjectData(t.designJson);
    } else if (t.renderedHtml) {
      // Best-effort, one-way import: wrap the classic HTML in mj-raw so it
      // compiles back out unchanged, rather than trying to decompose
      // arbitrary hand-written HTML into editable mj-* components (which
      // GrapesJS/MJML has no reliable way to do).
      editor.setComponents(
        `<mjml><mj-body><mj-raw>${t.renderedHtml}</mj-raw></mj-body></mjml>`,
      );
    } else {
      editor.setComponents(EMPTY_MJML);
    }
    seededRef.current = true;
  }, [editorReady, isNew, templateQuery.isLoading, templateQuery.data]);

  const handleSave = async (andClose: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!name.trim()) {
      toast.error('Give this template a name first');
      return;
    }

    setSaving(true);
    try {
      const result = editor.runCommand('mjml-code-to-html') as unknown;
      const html =
        typeof result === 'string' ? result : ((result as { html?: string })?.html ?? '');
      const designJson = editor.getProjectData() as Record<string, unknown>;

      const payload = {
        name: name.trim(),
        renderedHtml: html,
        designJson,
        builderType: 'pro' as const,
      };

      if (!templateId) {
        const created = await createMutation.mutateAsync(payload);
        setTemplateId(created.id);
        navigate(`/app/templates/${created.id}/builder`, { replace: true });
      } else {
        await updateMutation.mutateAsync({ id: templateId, ...payload });
      }
      if (andClose) navigate('/app/templates');
    } catch (err) {
      toast.error(normalizeAxiosError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const isSaving = saving || createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/app/templates')}>
            <X className="h-4 w-4" />
          </Button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="h-9 w-64"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={isSaving}>
            Save & Close
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
          <PanelSection title="Blocks" className="max-h-[55%] shrink-0 overflow-y-auto">
            <div ref={blocksRef} />
          </PanelSection>
          <PanelSection title="Layers" className="min-h-0 flex-1 overflow-y-auto">
            <div ref={layersRef} />
          </PanelSection>
        </div>

        <div className="min-w-0 flex-1 overflow-auto" ref={containerRef} />

        <div className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
          <PanelSection title="Style" className="min-h-0 flex-1 overflow-y-auto">
            <div ref={stylesRef} />
          </PanelSection>
          <PanelSection title="Settings" className="max-h-[35%] shrink-0 overflow-y-auto">
            <div ref={traitsRef} />
          </PanelSection>
        </div>
      </div>
    </div>
  );
}

function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col border-b border-border', className)}>
      <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="p-2">{children}</div>
    </div>
  );
}
