# Pre-launch environment checklist

This checklist implements point 8 of the QA/deployment plan. Treat it as a
mandatory gate before promoting a release to the production domain (see
`docs/deployment.md`'s deployment flow, step 6) — do not launch or point DNS
at production until every item below is confirmed.

Copy this list into the launch tracking issue/PR and check off each item
against the **production** Vercel project and **production** Supabase
project specifically (not staging).

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
      are set on the production Vercel project and point at the production
      Supabase project (not staging or a local project). See `.env.example`
      for the expected shape.
- [ ] Supabase Auth → URL Configuration has the production domain(s)
      registered as the **Site URL** and in **Redirect URLs**, covering both
      the auth callback and `app/reset-password` — otherwise magic-link/reset
      emails will redirect users back to staging or `localhost`.
- [ ] Outbound email (password reset, any transactional email) is verified
      end-to-end on production: sender address, SMTP/provider configuration
      in Supabase Auth settings, and the actual email templates render
      correctly (not just the default Supabase template).
- [ ] R2 secrets (`R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET_NAME`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are configured **only** as
      Supabase Edge Function secrets (`supabase secrets set ...`), never as
      `NEXT_PUBLIC_*` Vercel environment variables — these are the storage
      backend credentials for `supabase/functions/candidate-documents`
      and must not be exposed to the browser bundle.
- [ ] Cloudflare R2 CORS is applied from `cloudflare/r2-cors-wrangler.json`;
      an `OPTIONS` request from the production origin returns the matching
      `Access-Control-Allow-Origin` header.
- [ ] `DOCUMENTS_ALLOWED_ORIGINS` (an Edge Function secret) is restricted to
      the actual production domain(s) only — no staging URLs, no
      `localhost`, no wildcard.
- [ ] `DOCUMENT_SCANNER_URL` is configured and its fail-closed behaviour is
      verified: candidate document uploads are scanned before being marked
      clean, and an unreachable/misconfigured scanner blocks the upload
      rather than silently accepting it (see
      `supabase/functions/candidate-documents/index.ts`).
- [ ] The production Supabase project's migrations are fully applied and
      match `supabase/migrations/` exactly (`supabase db push` completed
      with no pending migrations) — see `docs/database.md`.
- [ ] Production Vercel project's environment variables do not leak any
      staging-only values (staging Supabase URL/key, test E2E credentials).
- [ ] Native Firebase configuration and `FIREBASE_SERVICE_ACCOUNT_JSON` are
      installed in the protected release environments; push is verified on
      physical iOS and Android devices as described in `docs/native-release.md`.
- [ ] Supabase managed backups/PITR are enabled, the scheduled verification
      workflow succeeds, and a restore drill has been documented.

Once every box is checked, proceed with the production promotion/DNS cutover
described in `docs/deployment.md`.
