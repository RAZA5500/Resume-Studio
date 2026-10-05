import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    // The auth tests hash real bcrypt passwords and make RSA / EC keys: seconds of CPU on a busy machine.
    testTimeout: 30_000,
  },
});
