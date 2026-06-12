import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
  },
});
