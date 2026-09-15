import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/query.client';
import { AppRouter } from '@/routes';
import { useThemeStore } from '@/stores/theme.store';

/**
 * App root — Chunk 4.
 *
 * New in this chunk: Sonner Toaster mounted globally so any `toast.*()`
 * call from a page component renders. We pass `theme` derived from our
 * theme store so the toasts match dark/light mode automatically.
 */
export default function App() {
  const mode = useThemeStore((s) => s.mode);
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster
        theme={mode}
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          // Match our design tokens so toasts feel native, not stock Sonner.
          classNames: {
            toast: 'border border-border bg-card text-card-foreground',
          },
        }}
      />
    </QueryClientProvider>
  );
}
