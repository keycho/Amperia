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
    // Phaser is a single large module; this is expected.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../shared/**/*.test.ts'],
  },
});
