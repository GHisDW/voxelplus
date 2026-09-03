import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'node:path';

export default defineConfig({
  root: 'frontend',
  plugins: [
    electron([
      {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: [
                'electron',
                'adm-zip',
                'node:child_process',
                'node:fs',
                'node:fs/promises',
                'node:path',
                'node:os',
                'node:crypto',
                'node:events',
                'node:https',
                'node:http',
                'node:stream',
                'node:url'
              ]
            }
          }
        }
      },
      {
        entry: path.resolve(__dirname, 'electron/preload.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ])
  ],
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
