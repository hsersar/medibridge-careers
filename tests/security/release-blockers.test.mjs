import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = async path => readFile(new URL(path, root), "utf8");

test("candidate documents accept the general type exposed by the UI", async () => {
  const edge = await source("supabase/functions/candidate-documents/index.ts");
  assert.match(edge, /allowedDocumentTypes[^;]+"general"/s);
});

test("candidate document uploads reject anonymous Supabase identities", async () => {
  const edge = await source("supabase/functions/candidate-documents/index.ts");
  assert.match(edge, /userClaims\?\.is_anonymous === true/);
});

test("candidate RLS policies reject anonymous Supabase identities", async () => {
  const migration = await source("supabase/migrations/20260907150000_reject_anonymous_candidate_access.sql");
  assert.match(migration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  for (const table of ["candidates", "candidate_intakes", "candidate_documents", "candidate_job_preferences", "candidate_job_interests", "candidate_saved_jobs", "candidate_applications", "candidate_notifications", "consent_events", "candidate_device_tokens"]) {
    assert.match(migration, new RegExp(`on public\\.${table}`));
  }
});

test("verified deletion removes R2 objects and the Supabase Auth identity", async () => {
  const purge = await source("supabase/functions/purge-candidate-data/index.ts");
  assert.match(purge, /removeObject\(document\.storage_path\)/);
  assert.match(purge, /auth\.admin\.deleteUser\(item\.candidate_id\)/);
  assert.match(purge, /privacy_deletion_receipts/);
});

test("backup verification keeps production dumps out of GitHub artifacts", async () => {
  const workflow = await source(".github/workflows/backup.yml");
  assert.match(workflow, /database\/backups\/schedule/);
  assert.doesNotMatch(workflow, /pg_dump|upload-artifact/);
});

test("production deployment applies the committed R2 CORS policy", async () => {
  const workflow = await source(".github/workflows/deploy-production.yml");
  assert.match(workflow, /wrangler r2 bucket cors set medibridge-candidate-documents/);
  assert.match(workflow, /cloudflare\/r2-cors-wrangler\.json/);
});

test("production deployment safely builds the Supabase pooler URL from a password secret", async () => {
  const workflow = await source(".github/workflows/deploy-production.yml");
  assert.match(workflow, /secrets\.SUPABASE_DB_PASSWORD/);
  assert.match(workflow, /encodeURIComponent\(process\.env\.SUPABASE_DB_PASSWORD\)/);
  assert.match(workflow, /aws-1-eu-west-1\.pooler\.supabase\.com:5432\/postgres\?sslmode=require/);
  assert.doesNotMatch(workflow, /secrets\.SUPABASE_DATABASE_URL/);
});

test("production deployment safely baselines manually applied Supabase migrations", async () => {
  const workflow = await source(".github/workflows/deploy-production.yml");
  assert.match(workflow, /supabase migration list --db-url/);
  assert.match(workflow, /if \[ "\$applied_baseline" -eq 0 \]/);
  assert.match(workflow, /supabase migration repair "\$\{baseline_versions\[@\]\}"/);
  assert.match(workflow, /--status applied/);
  assert.match(workflow, /elif \[ "\$applied_baseline" -ne "\$\{#baseline_versions\[@\]\}" \]/);
});

test("application sends the required production security headers", async () => {
  const config = await source("next.config.ts");
  for (const header of [
    "Content-Security-Policy",
    "Referrer-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.match(config, new RegExp(header));
  }
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /object-src 'none'/);
  assert.match(config, /poweredByHeader:\s*false/);
});

test("candidate saved jobs always expose the id selected by the application", async () => {
  const migration = await source("supabase/migrations/20260912100000_sprint_6_release_hardening.sql");
  assert.match(migration, /candidate_saved_jobs[\s\S]+add column if not exists id uuid/);
  assert.match(migration, /alter column id set not null/);
  assert.match(migration, /candidate_saved_jobs_id_key/);
});

test("scheduled backup verification uses production environment secrets", async () => {
  const workflow = await source(".github/workflows/backup.yml");
  assert.match(workflow, /environment: production/);
});
