import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const shared = fileURLToPath(new URL('../shared', import.meta.url));
const assets = fileURLToPath(new URL('../assets', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': shared,
      '@assets': assets,
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    // The phaser vendor chunk is the whole engine (~1.2 MB minified) and
    // cannot be split further; the app chunk stays under Vite's 500 kB default.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          // Phaser is ~1.4 MB minified; isolating it keeps the app chunk
          // small and lets browsers cache the engine across releases.
          phaser: ['phaser'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../shared/**/*.test.ts'],
  },
});
