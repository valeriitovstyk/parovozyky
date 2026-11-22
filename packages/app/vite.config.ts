import { defineConfig } from 'vite';

export default defineConfig({
  // relative URLs: the build works from any directory (e.g. GitHub Pages)
  base: './',
  build: { outDir: '../../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { port: 5173, strictPort: false },
});
