import assert from "node:assert/strict";
import test from "node:test";

import { createQueryChain, createTestContext } from "./test-utils.mjs";

test("signInBackoffice signs out and rejects users without a staff membership", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let signedOut = false;
  ctx.mockSupabase({
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      signOut: async () => {
        signedOut = true;
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => createQueryChain({ data: null, error: null }),
        }),
      }),
    }),
  });

  const { signInBackoffice } = await ctx.load("/lib/backoffice.ts");
  await assert.rejects(
    () => signInBackoffice("candidate@example.com", "password"),
    /NOT_STAFF/,
  );
  assert.equal(signedOut, true);
});

test("signInBackoffice returns the staff membership on success", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "staff-1" } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            createQueryChain({
              data: { display_name: "Jane Doe", role: "recruiter" },
              error: null,
            }),
        }),
      }),
    }),
  });

  const { signInBackoffice } = await ctx.load("/lib/backoffice.ts");
  const membership = await signInBackoffice("staff@example.com", "password");
  assert.deepEqual(membership, { display_name: "Jane Doe", role: "recruiter" });
});

test("signInBackoffice rejects invalid credentials before checking membership", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      signInWithPassword: async () => ({
        data: { user: null },
        error: new Error("Invalid login credentials"),
      }),
    },
  });

  const { signInBackoffice } = await ctx.load("/lib/backoffice.ts");
  await assert.rejects(
    () => signInBackoffice("nobody@example.com", "wrong"),
    /Invalid login credentials/,
  );
});

test("getBackofficeSession returns null when there is no active session", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getSession: async () => ({ data: { session: null } }) },
  });

  const { getBackofficeSession } = await ctx.load("/lib/backoffice.ts");
  assert.equal(await getBackofficeSession(), null);
});

test("getBackofficeSession returns null for anonymous sessions", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "anon-1", is_anonymous: true } } },
      }),
    },
  });

  const { getBackofficeSession } = await ctx.load("/lib/backoffice.ts");
  assert.equal(await getBackofficeSession(), null);
});

test("getBackofficeSession returns null when the user is not a staff member", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "user-1", is_anonymous: false } } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => createQueryChain({ data: null, error: null }),
        }),
      }),
    }),
  });

  const { getBackofficeSession } = await ctx.load("/lib/backoffice.ts");
  assert.equal(await getBackofficeSession(), null);
});

test("addInternalNote requires an authenticated staff user", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });

  const { addInternalNote } = await ctx.load("/lib/backoffice.ts");
  await assert.rejects(
    () => addInternalNote("candidate-1", "note"),
    /UNAUTHENTICATED/,
  );
});

test("updateCandidateStatus requires an authenticated staff user", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });

  const { updateCandidateStatus } = await ctx.load("/lib/backoffice.ts");
  await assert.rejects(
    () => updateCandidateStatus("candidate-1", "submitted", "verified", ""),
    /UNAUTHENTICATED/,
  );
});

test("updateCandidateStatus records status history for the authenticated staff user", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  const calls = [];
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) },
    from: (table) => ({
      update: (payload) => {
        calls.push({ table, payload });
        return { eq: () => createQueryChain({ data: null, error: null }) };
      },
      insert: (payload) => {
        calls.push({ table, payload });
        return createQueryChain({ data: null, error: null });
      },
    }),
  });

  const { updateCandidateStatus } = await ctx.load("/lib/backoffice.ts");
  await updateCandidateStatus("candidate-1", "submitted", "verified", "looks good");

  const historyCall = calls.find((call) => call.table === "candidate_status_history");
  assert.equal(historyCall.payload.changed_by, "staff-1");
  assert.equal(historyCall.payload.previous_status, "submitted");
  assert.equal(historyCall.payload.new_status, "verified");
});
