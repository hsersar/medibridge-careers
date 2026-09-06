import { expect, test } from "@playwright/test";

/**
 * Backoffice login and role-authorization flow: a seeded `backoffice_users`
 * account can sign in and reach the candidate pool, while a plain candidate
 * account is rejected with "no staff membership". See playwright.config.ts
 * for the required environment variables.
 */
const staffEmail = process.env.E2E_STAFF_EMAIL;
const staffPassword = process.env.E2E_STAFF_PASSWORD;
const candidateEmail = process.env.E2E_CANDIDATE_EMAIL;
const candidatePassword = process.env.E2E_CANDIDATE_PASSWORD;

test.describe("backoffice login and authorization", () => {
  test.skip(
    !staffEmail || !staffPassword,
    "Requires a seeded backoffice_users account (E2E_STAFF_EMAIL/PASSWORD); see docs/deployment.md.",
  );

  test("staff member can sign in and see the candidate pool", async ({ page }) => {
    await page.goto("/backoffice");
    await page.getByLabel(/e-mail/i).fill(staffEmail!);
    await page.getByLabel(/passwort/i).fill(staffPassword!);
    await page.getByRole("button", { name: /anmelden/i }).click();

    await expect(page.getByText(/kandidaten/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("a candidate without backoffice_users membership is rejected", async ({ page }) => {
    test.skip(!candidateEmail || !candidatePassword, "Requires a seeded candidate account.");

    await page.goto("/backoffice");
    await page.getByLabel(/e-mail/i).fill(candidateEmail!);
    await page.getByLabel(/passwort/i).fill(candidatePassword!);
    await page.getByRole("button", { name: /anmelden/i }).click();

    await expect(
      page.getByText(/anmeldung nicht möglich oder keine backoffice-berechtigung/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
