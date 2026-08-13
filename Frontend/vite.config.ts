import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite config.
 *
 * Two things worth noting:
 *
 * 1) Path alias @/ -> src/. Same alias is set in tsconfig.json and in
 *    tailwind.config.ts so imports and Tailwind's content globs stay in sync.
 *
 * 2) Dev-only proxy. In production the frontend and backend probably live at
 *    different origins (e.g. web.acme.com + api.acme.com). During local dev
 *    we call `/api/...` from the browser and Vite proxies it to the NestJS
 *    server on :3000 — no CORS setup needed. The `/api` prefix matches
 *    NestJS's app.setGlobalPrefix('api').
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
