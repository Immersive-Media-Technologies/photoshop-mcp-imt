// Deep Artisan: свой конфиг — иначе vitest подхватывает vitest.config.ts родительского
// репозитория (~/deep-artisan) с его setup-файлом рендерера.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
