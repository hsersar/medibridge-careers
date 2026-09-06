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

test("updateCandidateStatus calls the transactional status RPC for the authenticated staff user", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  const calls = [];
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "staff-1" } } }) },
    rpc: (name, params) => {
      calls.push({ name, params });
      return createQueryChain({ data: null, error: null });
    },
  });

  const { updateCandidateStatus } = await ctx.load("/lib/backoffice.ts");
  await updateCandidateStatus("candidate-1", "submitted", "verified", "looks good");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "update_candidate_status");
  assert.deepEqual(calls[0].params, {
    candidate_id: "candidate-1",
    new_status: "verified",
    note: "looks good",
  });
});

test("listBackofficeCandidates paginates using range() derived from page and pageSize", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  const calls = [];
  ctx.mockSupabase({
    from: (table) => {
      if (table === "candidates") {
        return {
          select: () => ({
            order: () => ({
              range: (from, to) => {
                calls.push({ from, to });
                return createQueryChain({ data: [], error: null, count: 0 });
              },
            }),
          }),
        };
      }
      return { select: () => ({ in: () => createQueryChain({ data: [], error: null }) }) };
    },
  });

  const { listBackofficeCandidates } = await ctx.load("/lib/backoffice.ts");
  const result = await listBackofficeCandidates({ page: 3, pageSize: 10 });

  assert.deepEqual(calls[0], { from: 20, to: 29 });
  assert.deepEqual(result, { rows: [], total: 0 });
});

test("listBackofficeCandidates strips characters that would break the PostgREST or() filter", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let orFilter = "";
  ctx.mockSupabase({
    from: (table) => {
      if (table === "candidates") {
        return {
          select: () => ({
            order: () => ({
              or: (filter) => {
                orFilter = filter;
                return { range: () => createQueryChain({ data: [], error: null, count: 0 }) };
              },
            }),
          }),
        };
      }
      return { select: () => ({ in: () => createQueryChain({ data: [], error: null }) }) };
    },
  });

  const { listBackofficeCandidates } = await ctx.load("/lib/backoffice.ts");
  await listBackofficeCandidates({ query: "a,b(c)d%e_f" });

  const expectedLike = '"%a,b(c)d\\%e\\_f%"';
  assert.equal(orFilter, `full_name.ilike.${expectedLike},email.ilike.${expectedLike},reference_number.ilike.${expectedLike},residence.ilike.${expectedLike}`);
});

test("countCandidatesByStatus issues a head-only count query", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  const calls = [];
  ctx.mockSupabase({
    from: (table) => ({
      select: (columns, options) => {
        calls.push({ table, columns, options });
        return { eq: () => createQueryChain({ data: null, error: null, count: 7 }) };
      },
    }),
  });

  const { countCandidatesByStatus } = await ctx.load("/lib/backoffice.ts");
  const count = await countCandidatesByStatus("verified");

  assert.equal(count, 7);
  assert.deepEqual(calls[0].options, { count: "exact", head: true });
});

test("updateCandidateProfile updates candidates and, when provided, candidate_intakes", async (t) => {
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

  const { updateCandidateProfile } = await ctx.load("/lib/backoffice.ts");
  await updateCandidateProfile("candidate-1", { full_name: "New Name" }, { targetRole: "Nurse" });

  const candidateUpdate = calls.find((call) => call.table === "candidates");
  const intakeUpdate = calls.find((call) => call.table === "candidate_intakes");
  assert.equal(candidateUpdate.payload.full_name, "New Name");
  assert.deepEqual(intakeUpdate.payload.answers, { targetRole: "Nurse" });
});
