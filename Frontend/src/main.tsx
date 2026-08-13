/**
 * Entry point. Vite loads this from index.html via <script type="module">.
 *
 * Chunk 1 is minimal — just React mounting App. Chunk 3 wraps App with:
 *   - QueryClientProvider (TanStack Query)
 *   - RouterProvider (React Router)
 *   - ThemeProvider (dark/light toggle)
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
