import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite for the candidate application flow and the backoffice
 * login/authorization flow. These specs exercise real Supabase auth and RLS
 * behaviour and therefore require a seeded Supabase project (staging or a
 * local `supabase start` instance) reachable at the configured URL.
 *
 * Required environment variables (see docs/deployment.md and .env.example):
 *   PLAYWRIGHT_BASE_URL          - URL of the running app (e.g. staging).
 *   NEXT_PUBLIC_SUPABASE_URL     - Supabase project used by that deployment.
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD - seeded test candidate.
 *   E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD         - seeded backoffice_users row.
 *
 * Sprint 7 deliberately fails fast when any staging value is absent. A green
 * E2E job must always mean that the real staging backend was exercised.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  webServer: {
    command: "npm run start:e2e",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
