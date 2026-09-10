import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: './',
root: 'frontend',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
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

