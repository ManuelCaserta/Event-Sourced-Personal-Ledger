import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit tests only (no DB). Integration tests live in *.int.test.ts
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/*.int.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});

