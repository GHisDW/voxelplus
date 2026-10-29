import { defineConfig } from 'vite';
import path from 'node:path';

// Electron 33 ships Chromium 130. Targeting it directly avoids legacy
// transpilation/polyfills in the renderer bundle, which keeps the launch bundle
// small and quick to parse on the first frame.
export default defineConfig({
  base: './',
  root: 'frontend',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome130',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: false,
    assetsInlineLimit: 4096,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1200
  },
  esbuild: {
    legalComments: 'none'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src')
    }
  },
  server: {
    port: 5173
  }
});
