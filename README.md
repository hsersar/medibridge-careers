# MediBridge Careers

MediBridge Careers is the candidate and backoffice portal for MediBridge
Maghreb: candidates apply, upload documents, and track their status, while
MediBridge staff review applications, verify documents, and manage job
postings.

- **Candidate app** (`app/page.tsx`, `app/privacy`, `app/reset-password`):
  application intake, document upload, job interest, status tracking, and
  privacy/data-subject requests (access, correction, deletion, consent
  withdrawal).
- **Backoffice app** (`app/backoffice`, `app/backoffice/jobs`): staff login
  gated by a `backoffice_users` row, candidate pool review, document
  verification, internal notes, status changes, and job posting management.
- **Data layer**: Supabase (Postgres + Auth + Storage), with Row Level
  Security policies scoping candidates to their own data and staff-only
  tables to `backoffice_users` members (`lib/supabase.ts`, `lib/jobs.ts`,
  `lib/backoffice.ts`, `supabase/migrations/`).
- **Document storage**: candidate documents are uploaded via
  `supabase/functions/candidate-documents`, scanned fail-closed through
  `DOCUMENT_SCANNER_URL` before being marked clean, and stored in
  Cloudflare R2 (see `.env.example`).

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`
- A Supabase project (local via the Supabase CLI, or a hosted project) — see
  `docs/database.md`.

## Setup

1. Copy `.env.example` to `.env` and fill in `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for your Supabase project.
2. R2 credentials and `DOCUMENTS_ALLOWED_ORIGINS`/`DOCUMENT_SCANNER_URL` are
   configured as **Supabase Edge Function secrets**
   (`supabase secrets set ...`), not as `NEXT_PUBLIC_*` values — see
   `docs/environment-checklist.md` for the full pre-launch list.
3. `npm install`
4. `npm run dev` to start the local dev server.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the local Vite/Vinext dev server. |
| `npm run build` | Full verified build used by the platform's checkpoint/deploy path (`scripts/build-verified.sh`). |
| `npm run build:vercel` | Plain `next build`, used by the `build` CI job and Vercel deployments. |
| `npm run lint` | ESLint over the whole repo. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test:unit` | Business-logic tests (`tests/unit/`) and static RLS-policy coverage (`tests/security/`) — fast, no external services. |
| `npm run test:build` | Verifies the built vinext worker renders real MediBridge pages (`tests/build/`); required in CI, see `.github/workflows/ci.yml`. |
| `npm run test` | Build, then run all of the above test suites. |
| `npm run test:migrations` | Apply `supabase/migrations/` to a fresh local Supabase stack and run the pgTAP RLS suite (`supabase/tests/database/`); requires Docker and the Supabase CLI. See `docs/database.md`. |
| `npm run test:e2e` | Playwright suite (`e2e/`) against a seeded staging/local instance; see `docs/deployment.md`. |

## Further documentation

- [`docs/database.md`](docs/database.md) — Supabase migration naming/review
  process, seed-data strategy, and the CI migration-test job.
- [`docs/deployment.md`](docs/deployment.md) — staging environment, the
  feature-branch → staging → production deployment flow, and the rollback
  process.
- [`docs/environment-checklist.md`](docs/environment-checklist.md) —
  mandatory pre-launch checklist for production environment variables,
  redirects, email, and secrets.

---

## Platform internals (Sites/Vinext hosting)

The sections below describe the underlying Vinext starter and the OpenAI
Sites hosting platform this app is deployed on. They matter for how the
scripts under `scripts/` work, but are not part of the MediBridge product
itself.

### Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with
  `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper
  module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can
  prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned
  `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and run the full test suite (see the Scripts table above
  for the MediBridge-specific test suites this now includes)
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
