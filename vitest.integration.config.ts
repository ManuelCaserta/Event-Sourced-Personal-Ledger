import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.{test,spec}.ts'], // Only include integration tests
    pool: 'forks', // Use forks pool for isolation
    maxWorkers: 1, // Run tests sequentially
    maxConcurrency: 1, // Run tests sequentially
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});

