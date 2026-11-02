import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'development-csp',
        transformIndexHtml(html, context) {
          // React Fast Refresh injects an inline preamble in development.
          return context.server
            ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            : html;
        },
      },
    ],
  },
});
