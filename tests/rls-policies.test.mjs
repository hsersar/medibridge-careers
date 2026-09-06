import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260905190000_production_hardening.sql", root), "utf8");
const release = await readFile(new URL("supabase/migrations/20260901130000_sprint_5_jobs_release.sql", root), "utf8");

test("production tables enable RLS and enforce candidate ownership", () => {
  assert.match(migration, /alter table public\.candidate_saved_jobs enable row level security/);
  assert.match(migration, /auth\.uid\(\) = candidate_id/);
  assert.match(migration, /alter table public\.app_errors enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
});

test("privacy and feedback policies do not expose unrestricted writes", () => {
  assert.match(release, /Candidates create own privacy requests/);
  assert.match(release, /auth\.uid\(\)=candidate_id/);
  assert.match(release, /Staff read pilot feedback/);
  assert.doesNotMatch(release, /pilot_feedback.*for all/i);
});
