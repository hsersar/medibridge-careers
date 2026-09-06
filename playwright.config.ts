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
 * When these are not configured (e.g. a plain PR build with no staging
 * environment yet), the specs skip themselves instead of failing the run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
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
