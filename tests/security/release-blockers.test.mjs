import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = async path => readFile(new URL(path, root), "utf8");

test("candidate documents accept the general type exposed by the UI", async () => {
  const edge = await source("supabase/functions/candidate-documents/index.ts");
  assert.match(edge, /allowedDocumentTypes[^;]+"general"/s);
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
