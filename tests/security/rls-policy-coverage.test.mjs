import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = path.join(root, "supabase", "migrations");

/**
 * These tests are a fast, dependency-free safety net that runs on every PR:
 * they statically audit the SQL migrations so that any new `public` table
 * ships with Row Level Security enabled and at least one policy from the
 * start. They complement (not replace) the pgTAP integration tests under
 * `supabase/tests/database/`, which exercise the policies against a live
 * Postgres instance started by the Supabase CLI (see docs/database.md).
 */
async function readAllMigrations() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const contents = await Promise.all(
    files.map((f) => readFile(path.join(migrationsDir, f), "utf8")),
  );
  return contents.join("\n");
}

function findTables(sql, pattern) {
  const tables = new Set();
  for (const match of sql.matchAll(pattern)) {
    tables.add(match[1]);
  }
  return tables;
}

test("every public table created by a migration has Row Level Security enabled", async () => {
  const sql = await readAllMigrations();
  const createdTables = findTables(
    sql,
    /create table if not exists public\.(\w+)/gi,
  );
  const rlsEnabledTables = findTables(
    sql,
    /alter table public\.(\w+)\s+enable row level security/gi,
  );

  const missing = [...createdTables].filter((table) => !rlsEnabledTables.has(table));
  assert.deepEqual(
    missing,
    [],
    `Tables missing "enable row level security": ${missing.join(", ")}`,
  );
});

test("every public table with Row Level Security has at least one policy", async () => {
  const sql = await readAllMigrations();
  const rlsEnabledTables = findTables(
    sql,
    /alter table public\.(\w+)\s+enable row level security/gi,
  );
  const tablesWithPolicies = findTables(
    sql,
    /create policy "[^"]+" on public\.(\w+)/gi,
  );

  const missing = [...rlsEnabledTables].filter((table) => !tablesWithPolicies.has(table));
  assert.deepEqual(
    missing,
    [],
    `RLS-enabled tables without any policy: ${missing.join(", ")}`,
  );
});

test("candidate-facing tables restrict access to the owning candidate", async () => {
  const sql = await readAllMigrations();
  const candidateOwnedTables = [
    "candidates",
    "candidate_intakes",
    "candidate_documents",
    "candidate_job_preferences",
    "candidate_job_interests",
  ];

  for (const table of candidateOwnedTables) {
    const ownerPolicy = new RegExp(
      `create policy "[^"]+" on public\\.${table}[\\s\\S]*?auth\\.uid\\(\\)\\s*=\\s*(?:id|candidate_id)`,
      "i",
    );
    assert.match(
      sql,
      ownerPolicy,
      `Expected an owner-scoped policy (auth.uid() = id/candidate_id) for public.${table}`,
    );
  }
});

test("staff-only tables gate access behind public.is_backoffice_user()", async () => {
  const sql = await readAllMigrations();
  const staffOnlyTables = [
    "backoffice_users",
    "candidate_internal_notes",
    "candidate_status_history",
    "candidate_emails",
  ];

  for (const table of staffOnlyTables) {
    const policiesForTable = [
      ...sql.matchAll(
        new RegExp(`create policy "[^"]+" on public\\.${table}[^;]*;`, "gi"),
      ),
    ].map((m) => m[0]);
    assert.ok(
      policiesForTable.length > 0,
      `Expected at least one policy for public.${table}`,
    );
    const hasStaffOrOwnerGate = policiesForTable.some(
      (policy) =>
        policy.includes("public.is_backoffice_user()") ||
        policy.includes("auth.uid()"),
    );
    assert.ok(
      hasStaffOrOwnerGate,
      `Expected public.${table} policies to gate on is_backoffice_user() or auth.uid()`,
    );
  }
});

test("storage buckets used for uploads have per-owner storage.objects policies", async () => {
  const sql = await readAllMigrations();
  const buckets = findTables(sql, /insert into storage\.buckets\([^)]*\)\s*\n?\s*values\('([\w-]+)'/gi);
  const bucketsWithFolderScopedPolicies = new Set(
    [...sql.matchAll(/bucket_id\s*=\s*'([\w-]+)'[^;]*?storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/gis)].map(
      (m) => m[1],
    ),
  );

  const missing = [...buckets].filter((bucket) => !bucketsWithFolderScopedPolicies.has(bucket));
  assert.deepEqual(
    missing,
    [],
    `Storage buckets without a folder-scoped owner policy: ${missing.join(", ")}`,
  );
});

test("privacy request writes are scoped to the requesting candidate", async () => {
  const sql = await readAllMigrations();
  assert.match(
    sql,
    /create policy "[^"]+" on public\.data_subject_requests for insert with check\(auth\.uid\(\)=candidate_id\)/i,
  );
});
