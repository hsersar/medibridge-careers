#!/usr/bin/env bash
# Applies every migration in supabase/migrations against a disposable local
# Supabase stack (Postgres + auth/storage schemas) and runs the pgTAP RLS
# suite under supabase/tests/database. See docs/database.md for the full
# migration/seed strategy this script is part of.
#
# Requirements: Docker (used by the Supabase CLI to run the local stack) and
# either a globally installed `supabase` CLI or network access for `npx
# supabase`. This is the same tool used by `supabase test db` locally.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "test-migrations.sh requires Docker to run the local Supabase stack." >&2
  exit 69
fi

SUPABASE_BIN="npx --yes supabase@latest"
if command -v supabase >/dev/null 2>&1; then
  SUPABASE_BIN="supabase"
fi

cleanup() {
  $SUPABASE_BIN stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Starting local Supabase stack and applying supabase/migrations..."
$SUPABASE_BIN start

echo "Running pgTAP suite (supabase/tests/database)..."
$SUPABASE_BIN test db
