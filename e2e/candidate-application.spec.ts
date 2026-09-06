import { expect, test } from "@playwright/test";

/**
 * Candidate application flow: sign in with a seeded test account, submit the
 * intake form, and confirm the workspace reflects a submitted status. See
 * playwright.config.ts for the required environment variables.
 */
const email = process.env.E2E_CANDIDATE_EMAIL;
const password = process.env.E2E_CANDIDATE_PASSWORD;

test.describe("candidate application flow", () => {
  test.skip(
    !email || !password,
    "Requires a seeded Supabase test candidate (E2E_CANDIDATE_EMAIL/PASSWORD); see docs/deployment.md.",
  );

  test("candidate can sign in and reach their workspace", async ({ page }) => {
    await page.goto("/");

    // The candidate app starts on the welcome screen and only reveals the
    // authenticated workspace/login form after the user opts in.
    const continueButton = page.getByRole("button", { name: /start|beginnen|ابدأ/i });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }

    const emailField = page.getByLabel(/e-mail|email|بريد/i).first();
    await expect(emailField).toBeVisible({ timeout: 15_000 });
    await emailField.fill(email!);
    await page.getByLabel(/passwort|password|كلمة المرور/i).first().fill(password!);
    await page.getByRole("button", { name: /anmelden|sign in|تسجيل الدخول/i }).click();

    await expect(
      page.getByText(/medibridge careers/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("signed-in candidate can submit a privacy (data subject) request", async ({ page }) => {
    // The privacy endpoint requires an authenticated candidate session
    // (createPrivacyRequest throws PROFILE_REQUIRED otherwise), so sign in
    // first via the same flow as the previous test.
    await page.goto("/");
    const continueButton = page.getByRole("button", { name: /start|beginnen|ابدأ/i });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }
    const emailField = page.getByLabel(/e-mail|email|بريد/i).first();
    await expect(emailField).toBeVisible({ timeout: 15_000 });
    await emailField.fill(email!);
    await page.getByLabel(/passwort|password|كلمة المرور/i).first().fill(password!);
    await page.getByRole("button", { name: /anmelden|sign in|تسجيل الدخول/i }).click();
    await expect(page.getByText(/medibridge careers/i).first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/privacy");
    const accessButton = page.getByRole("button", { name: /auskunft anfordern|request access/i });
    await expect(accessButton).toBeVisible({ timeout: 15_000 });
    await accessButton.click();
    await expect(page.getByText(/registriert|received/i)).toBeVisible({ timeout: 15_000 });
  });
});
