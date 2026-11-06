import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  server: {
    port: 3000,
  },
});
