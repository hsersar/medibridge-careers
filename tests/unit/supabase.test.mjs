import assert from "node:assert/strict";
import test from "node:test";

import { createQueryChain, createTestContext } from "./test-utils.mjs";

test("getAuthenticatedCandidate returns null and signs out anonymous sessions", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let signedOut = null;
  ctx.mockSupabase({
    auth: {
      getUser: async () => ({
        data: { user: { id: "anon-1", is_anonymous: true } },
        error: null,
      }),
      signOut: async (options) => {
        signedOut = options;
      },
    },
  });

  const { getAuthenticatedCandidate } = await ctx.load("/lib/supabase.ts");
  const result = await getAuthenticatedCandidate();

  assert.equal(result, null);
  assert.deepEqual(signedOut, { scope: "local" });
});

test("getAuthenticatedCandidate returns null on auth error", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null }, error: new Error("no session") }) },
  });

  const { getAuthenticatedCandidate } = await ctx.load("/lib/supabase.ts");
  assert.equal(await getAuthenticatedCandidate(), null);
});

test("signInCandidate rejects anonymous accounts even on password match", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let signedOut = false;
  ctx.mockSupabase({
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "anon-1", is_anonymous: true } },
        error: null,
      }),
      signOut: async () => {
        signedOut = true;
      },
    },
  });

  const { signInCandidate } = await ctx.load("/lib/supabase.ts");
  await assert.rejects(
    () => signInCandidate("anon@example.com", "password"),
    /AUTHENTICATION_FAILED/,
  );
  assert.equal(signedOut, true);
});

test("signInCandidate normalizes email casing and whitespace", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let captured = null;
  ctx.mockSupabase({
    auth: {
      signInWithPassword: async (payload) => {
        captured = payload;
        return { data: { user: { id: "user-1", is_anonymous: false } }, error: null };
      },
    },
  });

  const { signInCandidate } = await ctx.load("/lib/supabase.ts");
  await signInCandidate("  Candidate@Example.com ", "password");

  assert.equal(captured.email, "candidate@example.com");
});

test("getCandidateWorkspace requires an authenticated, non-anonymous candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  });

  const { getCandidateWorkspace } = await ctx.load("/lib/supabase.ts");
  await assert.rejects(() => getCandidateWorkspace(), /AUTH_REQUIRED/);
});

test("uploadCandidateDocument rejects oversized files before contacting the edge function", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", is_anonymous: false } }, error: null }),
    },
    functions: {
      invoke: async () => {
        throw new Error("should not be called for oversized files");
      },
    },
  });

  const { uploadCandidateDocument } = await ctx.load("/lib/supabase.ts");
  const oversized = { size: 11 * 1024 * 1024, type: "application/pdf", name: "cv.pdf" };
  await assert.rejects(
    () => uploadCandidateDocument("cv", oversized),
    /FILE_TOO_LARGE/,
  );
});

test("uploadCandidateDocument rejects disallowed mime types", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", is_anonymous: false } }, error: null }),
    },
  });

  const { uploadCandidateDocument } = await ctx.load("/lib/supabase.ts");
  const badType = { size: 1024, type: "application/zip", name: "archive.zip" };
  await assert.rejects(
    () => uploadCandidateDocument("cv", badType),
    /INVALID_FILE_TYPE/,
  );
});

test("createCandidateDraft-style helpers reject unauthenticated writes", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  });

  const { saveCandidateDraft, saveJobPreferences } = await ctx.load("/lib/supabase.ts");
  await assert.rejects(() => saveCandidateDraft({}, "en"), /AUTH_REQUIRED/);
  await assert.rejects(
    () =>
      saveJobPreferences({
        desired_role: "",
        preferred_region: "",
        possible_start: "",
        workplace: "",
      }),
    /AUTH_REQUIRED/,
  );
});

test("submitCandidateIntake stamps a submission reference and marks the candidate submitted", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  const updates = [];
  ctx.mockSupabase({
    auth: {
      getUser: async () => ({ data: { user: { id: "12345678-user", is_anonymous: false } }, error: null }),
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => createQueryChain({ data: { status: "draft" }, error: null }) }),
      }),
      upsert: () => createQueryChain({ data: null, error: null }),
      update: (payload) => {
        updates.push({ table, payload });
        return { eq: () => createQueryChain({ data: null, error: null }) };
      },
    }),
  });

  const { submitCandidateIntake } = await ctx.load("/lib/supabase.ts");
  const reference = await submitCandidateIntake({
    answers: { fullName: "Jane Doe" },
    documentFiles: {},
    language: "en",
  });

  assert.match(reference, /^MB-\d{4}-12345678$/);
  const candidateUpdate = updates.find((u) => u.table === "candidates");
  assert.equal(candidateUpdate.payload.status, "submitted");
  assert.equal(candidateUpdate.payload.reference_number, reference);
});
