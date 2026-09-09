import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    env: {
      QR_SECRET: 'test-environment-qr-secret-key-configured-32chars',
      AUTH_SECRET: 'test-environment-auth-secret-minimum-32-chars-configured',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
