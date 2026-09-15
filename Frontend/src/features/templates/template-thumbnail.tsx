import { useEffect, useRef, useState } from 'react';

// Every seeded starter (and MJML's own default) renders at a 600px design
// width — a reasonable fixed assumption for "what an email looks like" that
// keeps this scaling math simple instead of trying to sniff each template's
// actual width out of its HTML.
const DESIGN_WIDTH = 600;
// Tall enough that after scaling down to a ~160-280px-wide card, the visible
// window is still fully covered (no blank strip at the bottom) for any email
// short of a very long one — the rest is clipped by the wrapper, which is
// the point: a thumbnail shows the top of the email, not the whole thing.
const DESIGN_HEIGHT = DESIGN_WIDTH * 1.4;

/**
 * Card thumbnail: a real (sandboxed, scriptless) iframe rendering of the
 * template's actual compiled HTML, scaled down to fit — not a screenshot,
 * not a stored image. `transform: scale()` on an absolutely-positioned
 * iframe inside an `overflow-hidden` wrapper; a ResizeObserver recomputes
 * the scale from the wrapper's real rendered width so it stays correct
 * across the grid's responsive column breakpoints.
 */
export function TemplateThumbnail({ html }: { html: string | null }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth > 0 ? el.clientWidth / DESIGN_WIDTH : 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative h-40 w-full overflow-hidden bg-white"
      aria-hidden="true"
    >
      {html ? (
        <iframe
          title="Template preview"
          sandbox=""
          srcDoc={html}
          scrolling="no"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            visibility: scale > 0 ? 'visible' : 'hidden',
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          No preview yet
        </div>
      )}
    </div>
  );
}
