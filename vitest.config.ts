// Own config: without it, vitest picks up the vitest.config.ts of an enclosing
// repository (when this one is checked out inside another project) and its setup files.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
