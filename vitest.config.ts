import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      // Redirect the `electron` import to a plain-Node stub so that main-process
      // modules can be imported by vitest without requiring the Electron binary.
      // The real Electron binary is absent in CI (Node.js vitest env, not Electron).
      electron: resolve(__dirname, 'src/__mocks__/electron.ts'),
    },
  },
});
