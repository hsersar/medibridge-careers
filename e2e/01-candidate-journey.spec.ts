import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminClient,
  e2eEnvironment,
  expectResendDelivery,
  signInCandidate,
  sprint7CandidateName,
  sprint7JobTitle,
} from "./support";

const cleanPdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
const infectedPdf = Buffer.from(
  "%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF",
);
const avatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function fillQuestion(field: Locator, step: number) {
  const choices = field.locator(".choice-grid button");
  if (await choices.count()) {
    await choices.nth(step === 6 ? 1 : 0).click();
    return;
  }
  const input = field.locator("input");
  if (await input.count()) {
    const type = await input.getAttribute("type");
    if (type === "date") await input.fill("1992-03-14");
    else if (type === "email") await input.fill(e2eEnvironment().E2E_DELIVERY_EMAIL);
    else if (type === "tel") await input.fill("+491701234567");
    else await input.fill(step === 0 ? sprint7CandidateName : `Sprint 7 answer ${step + 1}`);
    return;
  }
  const textarea = field.locator("textarea");
  if (await textarea.count()) await textarea.fill("Innere Medizin, Chirurgie und Altenpflege");
}

async function completeCurrentQuestionStep(page: Page, step: number) {
  const fields = page.locator(".question-field");
  for (let index = 0; index < await fields.count(); index += 1) {
    await fillQuestion(fields.nth(index), step);
  }
  const next = page.locator(".intake-actions .primary-button");
  await expect(next).toBeEnabled();
  await next.click();
}

async function openProfileMenu(page: Page) {
  await page.locator(".topbar .mini-avatar").click();
  await expect(page.locator(".profile-menu-sheet")).toBeVisible();
}

test.describe.serial("complete candidate journey", () => {
  test("registration, password visibility and password reset are functional", async ({ page }) => {
    const environment = e2eEnvironment();
    await page.goto("/");
    await page.getByRole("button", { name: /إنشاء ملفي/ }).click();
    await page.getByLabel(/البريد الإلكتروني/).fill(environment.E2E_REGISTRATION_EMAIL);
    await page.getByLabel(/كلمة المرور/).fill(environment.E2E_CANDIDATE_PASSWORD);
    const password = page.locator('input[autocomplete="new-password"]');
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /إظهار كلمة المرور/ }).click();
    await expect(password).toHaveAttribute("type", "text");
    const registrationStarted = new Date();
    await page.getByRole("button", { name: /إنشاء الحساب/ }).click();
    await expect(page.getByRole("status")).toContainText(/رابط التأكيد/);
    await expectResendDelivery(environment.E2E_REGISTRATION_EMAIL, registrationStarted);

    await page.getByRole("button", { name: /نسيت كلمة المرور/ }).click();
    await page.getByLabel(/البريد الإلكتروني/).fill(environment.E2E_CANDIDATE_EMAIL);
    const resetStarted = new Date();
    await page.getByRole("button", { name: /إرسال رابط إعادة التعيين/ }).click();
    await expect(page.getByRole("status")).toContainText(/إعادة تعيين كلمة المرور/);
    await expectResendDelivery(environment.E2E_CANDIDATE_EMAIL, resetStarted);
  });

  test("candidate completes intake and scanner blocks malware", async ({ page }) => {
    await signInCandidate(page);
    await expect(page.locator(".intake-page")).toBeVisible();
    for (let step = 0; step < 6; step += 1) await completeCurrentQuestionStep(page, step);

    const documentInputs = page.locator(".intake-document input[type=file]");
    await documentInputs.nth(0).setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: cleanPdf });
    await documentInputs.nth(1).setInputFiles({ name: "qualification.pdf", mimeType: "application/pdf", buffer: cleanPdf });
    await page.locator(".intake-actions .primary-button").click();
    await page.locator(".consent-row input").check();
    await page.locator(".review-wrap .intake-actions .primary-button").click();
    await expect(page.locator(".intake-success")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".reference-card strong")).toContainText(/^MB-/);
    await page.locator(".intake-success .primary-button").click();

    await page.getByRole("button", { name: /الوثائق/ }).click();
    await page.locator(".document-upload-panel select").selectOption("language");
    const upload = page.locator(".document-upload-panel input[type=file]").first();
    await upload.setInputFiles({ name: "eicar-test.pdf", mimeType: "application/pdf", buffer: infectedPdf });
    await expect(page.locator(".document-message")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("eicar-test.pdf")).toHaveCount(0);
    const rejected = await adminClient().from("candidate_documents").select("id", { count: "exact", head: true }).eq("file_name", "eicar-test.pdf");
    expect(rejected.error).toBeNull();
    expect(rejected.count).toBe(0);
  });

  test("profile, language, avatar and job preferences persist", async ({ page }) => {
    await signInCandidate(page);
    await openProfileMenu(page);
    await page.locator(".profile-menu-nav button").nth(0).click();
    await page.locator(".profile-section .inline-action").click();
    await page.getByLabel(/Full name|الاسم الكامل/).fill(`${sprint7CandidateName} Updated`);
    await page.locator(".profile-section .inline-action").click();
    await expect(page.getByText(`${sprint7CandidateName} Updated`).first()).toBeVisible();

    const avatar = page.locator(".avatar-upload-card input[type=file]");
    await avatar.setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: avatarPng });
    await expect(page.locator(".avatar-upload-card img")).toBeVisible({ timeout: 20_000 });
    await avatar.setInputFiles({ name: "avatar-replacement.png", mimeType: "image/png", buffer: avatarPng });
    await expect(page.locator(".avatar-upload-card img")).toBeVisible();
    await page.locator(".avatar-upload-card .remove").click();
    await expect(page.locator(".avatar-upload-card img")).toHaveCount(0);

    await page.locator(".header-back").click();
    await openProfileMenu(page);
    await page.locator(".profile-menu-nav button").nth(2).click();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("dir", "ltr");
    await page.locator(".header-back").click();
    await openProfileMenu(page);
    await page.locator(".profile-menu-nav button").nth(1).click();
    const preferences = page.locator(".preference-list input");
    await preferences.nth(0).fill("Registered nurse");
    await preferences.nth(1).fill("North Rhine-Westphalia");
    await preferences.nth(2).fill("Immediately");
    await preferences.nth(3).fill("Hospital");
    await page.getByRole("button", { name: /Save preferences/ }).click();
    await expect(page.getByText("Preferences saved")).toBeVisible();
  });

  test("candidate uploads, previews, replaces and deletes a clean document", async ({ page, context }) => {
    await signInCandidate(page);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.locator(".document-upload-panel select").selectOption("language");
    const upload = page.locator(".document-upload-panel input[type=file]").first();
    await upload.setInputFiles({ name: "language-b2.pdf", mimeType: "application/pdf", buffer: cleanPdf });
    await expect(page.getByText("language-b2.pdf")).toBeVisible({ timeout: 30_000 });

    const record = page.locator(".document-record").filter({ hasText: "language-b2.pdf" });
    const popupPromise = context.waitForEvent("page");
    await record.getByTitle("Preview").click();
    const preview = await popupPromise;
    await expect(preview).toHaveURL(/^https:/);
    await preview.close();

    const chooserPromise = page.waitForEvent("filechooser");
    await record.getByTitle("Replace").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: "language-c1.pdf", mimeType: "application/pdf", buffer: cleanPdf });
    await expect(page.getByText("language-c1.pdf")).toBeVisible({ timeout: 30_000 });
    const replacement = page.locator(".document-record").filter({ hasText: "language-c1.pdf" });
    await replacement.getByTitle("Delete").click();
    await expect(page.getByText("language-c1.pdf")).toHaveCount(0);
  });

  test("candidate saves a job, applies and files a privacy request", async ({ page }) => {
    await signInCandidate(page);
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    const job = page.locator(".job-wrap").filter({ hasText: sprint7JobTitle });
    await expect(job).toBeVisible();
    await job.getByRole("button", { name: "Save job" }).click();
    await job.locator(".job-card").click();
    await page.getByRole("button", { name: /Express interest/ }).click();
    await expect(page.getByText("Interest sent")).toBeVisible();
    await page.locator(".header-back").click();
    await page.getByRole("button", { name: "Applications", exact: true }).click();
    await expect(page.getByText(sprint7JobTitle)).toBeVisible();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();

    await page.goto("/privacy");
    await page.getByRole("button", { name: "Auskunft anfordern" }).click();
    await expect(page.locator(".privacy-result")).toContainText("registriert");

    const candidate = await adminClient().from("candidates").select("status").eq("email", e2eEnvironment().E2E_DELIVERY_EMAIL).single();
    expect(candidate.error).toBeNull();
    if (!candidate.data) throw new Error("E2E candidate was not persisted");
    expect(candidate.data.status).toBe("submitted");
  });
});
