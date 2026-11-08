import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(import.meta.dirname, './src/engine'),
      '@builder': path.resolve(import.meta.dirname, './src/builder'),
      '@types': path.resolve(import.meta.dirname, './src/types'),
      '@store': path.resolve(import.meta.dirname, './src/store'),
      '@ui': path.resolve(import.meta.dirname, './src/ui'),
      '@design': path.resolve(import.meta.dirname, './src/design'),
      '@scenarios': path.resolve(import.meta.dirname, './src/scenarios'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'bench/**'],
    maxConcurrency: 4,
  },
});
