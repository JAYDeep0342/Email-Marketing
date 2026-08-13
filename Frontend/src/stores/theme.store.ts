import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Theme store.
 *
 * Zustand + persist middleware. State is mirrored to localStorage under the
 * key `theme-store` so the choice survives reloads. When `mode` changes we
 * synchronously toggle the `dark` class on <html> — that's what actually
 * flips the CSS variables in index.css.
 *
 * We DEFAULT to dark. index.html also ships with class="dark" already so
 * the first paint is dark even before this store hydrates — no flash.
 */

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

// Apply the class to <html>. Called on every state change so React never
// has to think about it — the class is authoritative for the theme, the
// store is just the persistence layer.
function applyThemeClass(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      setMode: (mode) => {
        applyThemeClass(mode);
        set({ mode });
      },
      toggle: () => get().setMode(get().mode === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: 'theme-store',
      // Runs after Zustand rehydrates from localStorage on page load. If the
      // saved mode differs from the class already on <html> (e.g. user
      // previously chose light), reconcile now.
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.mode);
      },
    },
  ),
);
