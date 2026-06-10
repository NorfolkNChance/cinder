import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Cinder's Electron smoke test.
 *
 * We don't drive a browser — the spec launches the built Electron app via the
 * `_electron` API — so there are no browser `projects` and no `npx playwright
 * install` step is required. The test exercises the real main process (DB,
 * IPC) the same way a user launch would.
 */
export default defineConfig({
  testDir: './e2e',
  // A cold Electron launch + DB init + renderer mount needs headroom.
  timeout: 60_000,
  expect: { timeout: 30_000 },
  // The app is a singleton (single userData, global shortcut, tray) — never
  // run specs in parallel against it.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
});
