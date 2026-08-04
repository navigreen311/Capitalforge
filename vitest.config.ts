import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/frontend/**'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@backend': path.resolve(__dirname, 'src/backend'),
      // Mirrors the "@/*" path in src/frontend/tsconfig.json, so a test can
      // import a frontend module that imports its own siblings by alias.
      '@': path.resolve(__dirname, 'src/frontend'),
    },
  },
});
