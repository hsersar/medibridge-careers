import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

const requiredNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "E2E_SUPABASE_SERVICE_ROLE_KEY",
  "E2E_CANDIDATE_EMAIL",
  "E2E_CANDIDATE_PASSWORD",
  "E2E_STAFF_EMAIL",
  "E2E_STAFF_PASSWORD",
  "E2E_DELIVERY_EMAIL",
  "E2E_REGISTRATION_EMAIL",
  "E2E_RESEND_API_KEY",
] as const;

export type E2EEnvironment = Record<(typeof requiredNames)[number], string>;

export function e2eEnvironment(): E2EEnvironment {
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Sprint 7 E2E configuration is incomplete: ${missing.join(", ")}`);
  }
  return Object.fromEntries(requiredNames.map((name) => [name, process.env[name]!.trim()])) as E2EEnvironment;
}

export function adminClient(environment = e2eEnvironment()): SupabaseClient {
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.E2E_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInCandidate(page: Page) {
  const environment = e2eEnvironment();
  await page.goto("/");
  const loginLink = page.getByRole("button", { name: /لدي حساب بالفعل/ });
  await expect(loginLink).toBeVisible();
  await loginLink.click();
  await page.getByLabel(/البريد الإلكتروني/).fill(environment.E2E_CANDIDATE_EMAIL);
  await page.getByLabel(/كلمة المرور/).fill(environment.E2E_CANDIDATE_PASSWORD);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 20_000 });
}

export async function signInStaff(page: Page) {
  const environment = e2eEnvironment();
  await page.goto("/backoffice");
  await page.getByLabel("E-Mail").fill(environment.E2E_STAFF_EMAIL);
  await page.getByLabel("Passwort").fill(environment.E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Kandidaten", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

export const sprint7JobReference = "SPRINT7-E2E-JOB";
export const sprint7JobTitle = "Pflegefachkraft Sprint 7";
export const sprint7CandidateName = "Sprint Seven Candidate";

export async function findUserByEmail(client: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw result.error;
    const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (result.data.users.length < 100) break;
  }
  return null;
}

export async function ensureTestUser(client: SupabaseClient, email: string, password: string) {
  const existing = await findUserByEmail(client, email);
  if (existing) {
    const updated = await client.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (updated.error) throw updated.error;
    return updated.data.user;
  }
  const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  return created.data.user;
}

export async function expectResendDelivery(recipient: string, after: Date) {
  const { E2E_RESEND_API_KEY } = e2eEnvironment();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const response = await fetch("https://api.resend.com/emails?limit=100", {
      headers: { Authorization: `Bearer ${E2E_RESEND_API_KEY}` },
    });
    if (!response.ok) throw new Error(`Resend delivery lookup failed: ${response.status}`);
    const payload = await response.json() as { data?: Array<{ id: string; to: string[]; created_at: string; last_event?: string }> };
    const message = payload.data?.find((item) =>
      item.to.some((address) => address.toLowerCase() === recipient.toLowerCase()) &&
      new Date(item.created_at).getTime() >= after.getTime() - 2_000
    );
    if (message?.last_event === "delivered") return message.id;
    if (message && ["bounced", "complained", "failed"].includes(message.last_event ?? "")) {
      throw new Error(`Resend reported ${message.last_event} for ${recipient}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`No delivered Resend email observed for ${recipient}`);
}

export async function removeCandidateDocuments(client: SupabaseClient, candidateId: string, email: string, password: string) {
  const listed = await client.from("candidate_documents").select("id").eq("candidate_id", candidateId);
  if (listed.error) throw listed.error;
  if (!listed.data?.length) return;
  const candidate = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signedIn = await candidate.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  for (const document of listed.data) {
    const removed = await candidate.functions.invoke("candidate-documents", {
      body: { action: "delete", documentId: document.id },
    });
    if (removed.error) throw removed.error;
  }
}
