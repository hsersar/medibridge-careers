import { expect, test } from "@playwright/test";
import {
  adminClient,
  e2eEnvironment,
  expectResendDelivery,
  signInStaff,
  sprint7CandidateName,
  sprint7JobTitle,
} from "./support";

test.describe.serial("complete backoffice journey", () => {
  test("plain candidates are rejected by staff authorization", async ({ page }) => {
    const environment = e2eEnvironment();
    await page.goto("/backoffice");
    await page.getByLabel("E-Mail").fill(environment.E2E_CANDIDATE_EMAIL);
    await page.getByLabel("Passwort").fill(environment.E2E_CANDIDATE_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByText(/keine Backoffice-Berechtigung/)).toBeVisible();
  });

  test("staff filters candidates and updates profile, notes, review and status", async ({ page }) => {
    await signInStaff(page);
    const search = page.getByPlaceholder("Name, E-Mail oder Vorgang");
    await search.fill(sprint7CandidateName);
    const candidateButton = page.locator(".bo-list > button").filter({ hasText: sprint7CandidateName });
    await expect(candidateButton).toBeVisible();
    await candidateButton.click();

    await page.getByRole("button", { name: /Bearbeiten/ }).click();
    await page.getByLabel("Telefon").fill("+491701234568");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("+491701234568")).toBeVisible();

    await page.getByRole("button", { name: "Notizen" }).click();
    await page.getByPlaceholder(/Gespräch, Rückfrage/).fill("Sprint 7: Unterlagen telefonisch bestätigt.");
    await page.getByRole("button", { name: "Notiz speichern" }).click();
    await expect(page.getByText("Sprint 7: Unterlagen telefonisch bestätigt.")).toBeVisible();

    await page.getByRole("button", { name: "Dokumente" }).click();
    const qualification = page.locator(".bo-documents article").filter({ hasText: "qualification.pdf" });
    await expect(qualification).toBeVisible();
    await qualification.locator("textarea").fill("Qualifikation im Sprint-7-Test geprüft.");
    await qualification.getByRole("button", { name: "Verifizieren" }).click();
    await expect(qualification.getByText("Verifiziert")).toBeVisible();

    await page.getByRole("button", { name: "Prüfung" }).click();
    await page.getByLabel("Neuer Status").selectOption("under_review");
    await page.getByLabel(/Begründung/).fill("Vollständigkeitsprüfung läuft.");
    await page.getByRole("button", { name: "Status aktualisieren" }).click();
    await expect(page.getByText(/Eingereicht → In Prüfung/)).toBeVisible();
    await page.getByLabel("Neuer Status").selectOption("verified");
    await page.getByLabel(/Begründung/).fill("Alle Pflichtnachweise bestätigt.");
    await page.getByRole("button", { name: "Status aktualisieren" }).click();
    await expect(page.getByText(/In Prüfung → Verifiziert/)).toBeVisible();
  });

  test("staff manages interests and sends a real transactional email", async ({ page }) => {
    await signInStaff(page);
    await page.getByPlaceholder("Name, E-Mail oder Vorgang").fill(sprint7CandidateName);
    await page.locator(".bo-list > button").filter({ hasText: sprint7CandidateName }).click();

    await page.getByRole("button", { name: "Interessen" }).click();
    const interest = page.locator(".bo-interest").filter({ hasText: sprint7JobTitle });
    await expect(interest).toBeVisible();
    await interest.locator("select").selectOption("interview");
    await expect(interest.locator("select")).toHaveValue("interview");

    await page.getByRole("button", { name: "E-Mails" }).click();
    await page.getByLabel("Vorlage").selectOption({ label: "Sprint 7 Abnahme" });
    await expect(page.getByLabel("Empfänger")).toHaveValue(e2eEnvironment().E2E_DELIVERY_EMAIL);
    const deliveryStarted = new Date();
    await page.getByRole("button", { name: "E-Mail senden" }).click();
    await expect(page.locator(".bo-timeline").getByText(/sent/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Zustellung fehlgeschlagen/)).toHaveCount(0);
    await expectResendDelivery(e2eEnvironment().E2E_DELIVERY_EMAIL, deliveryStarted);
  });

  test("staff updates an anonymized job without exposing the employer reference", async ({ page }) => {
    await signInStaff(page);
    await page.goto("/backoffice/jobs");
    await page.locator(".jobs-admin-grid aside button").filter({ hasText: sprint7JobTitle }).click();
    const reference = page.getByLabel("Interne Arbeitgeberreferenz");
    await expect(reference).toHaveValue("SPRINT7-E2E-JOB");
    await page.getByLabel("MediBridge-Unterstützung").fill("Sprint 7: vollständige Begleitung bestätigt.");
    await page.getByRole("button", { name: "Job speichern" }).click();
    await expect(page.getByText("Job gespeichert.")).toBeVisible();

    const client = adminClient();
    const job = await client.from("jobs").select("support_text,status").eq("employer_reference", "SPRINT7-E2E-JOB").single();
    expect(job.error).toBeNull();
    if (!job.data) throw new Error("E2E job was not persisted");
    expect(job.data.support_text).toContain("Sprint 7");
    expect(job.data.status).toBe("published");
  });

  test("staff completes the candidate privacy request", async ({ page }) => {
    const client = adminClient();
    const candidate = await client.from("candidates").select("id").eq("email", e2eEnvironment().E2E_DELIVERY_EMAIL).single();
    expect(candidate.error).toBeNull();
    if (!candidate.data) throw new Error("E2E candidate was not found");

    await signInStaff(page);
    await page.goto("/backoffice/privacy");
    const request = page.locator(".bo-documents article").filter({ hasText: candidate.data.id });
    await expect(request).toBeVisible();
    await request.locator("select").selectOption("completed");
    await expect(request.getByText("Abgeschlossen")).toBeVisible();
  });
});
