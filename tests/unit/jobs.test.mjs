import assert from "node:assert/strict";
import test from "node:test";

import { createQueryChain, createTestContext } from "./test-utils.mjs";

test("listPublishedJobs only queries published jobs ordered by publish date", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let capturedTable = null;
  let capturedFilter = null;
  ctx.mockSupabase({
    from(table) {
      capturedTable = table;
      return {
        select: () => ({
          eq: (column, value) => {
            capturedFilter = [column, value];
            return {
              order: () =>
                createQueryChain({
                  data: [{ id: "job-1", title: "Nurse", status: "published" }],
                  error: null,
                }),
            };
          },
        }),
      };
    },
  });

  const { listPublishedJobs } = await ctx.load("/lib/jobs.ts");
  const jobs = await listPublishedJobs();

  assert.equal(capturedTable, "jobs");
  assert.deepEqual(capturedFilter, ["status", "published"]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, "job-1");
});

test("listPublishedJobs surfaces Supabase errors", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => createQueryChain({ data: null, error: new Error("boom") }),
        }),
      }),
    }),
  });

  const { listPublishedJobs } = await ctx.load("/lib/jobs.ts");
  await assert.rejects(() => listPublishedJobs(), /boom/);
});

test("listMyInterests returns an empty list for anonymous visitors", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });

  const { listMyInterests } = await ctx.load("/lib/jobs.ts");
  assert.deepEqual(await listMyInterests(), []);
});

test("listMyInterests scopes the query to the authenticated candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let capturedFilter = null;
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "candidate-1" } } }) },
    from: () => ({
      select: () => ({
        eq: (column, value) => {
          capturedFilter = [column, value];
          return createQueryChain({ data: [], error: null });
        },
      }),
    }),
  });

  const { listMyInterests } = await ctx.load("/lib/jobs.ts");
  await listMyInterests();

  assert.deepEqual(capturedFilter, ["candidate_id", "candidate-1"]);
});

test("listCandidateApplications returns the candidate's applications by latest update", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let capturedFilter = null;
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "candidate-1" } } }) },
    from: () => ({
      select: () => ({
        eq: (column, value) => {
          capturedFilter = [column, value];
          return {
            order: () => createQueryChain({
              data: [{ id: "application-1", job_id: "job-1", status: "reviewing" }],
              error: null,
            }),
          };
        },
      }),
    }),
  });

  const { listCandidateApplications } = await ctx.load("/lib/jobs.ts");
  const applications = await listCandidateApplications();

  assert.deepEqual(capturedFilter, ["candidate_id", "candidate-1"]);
  assert.equal(applications[0].status, "reviewing");
});

test("applyForJob upserts a submitted application for the authenticated candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let payload = null;
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "candidate-1" } } }) },
    from: () => ({
      upsert: (value) => {
        payload = value;
        return {
          select: () => ({
            single: () => createQueryChain({
              data: { id: "application-1", job_id: "job-1", status: "submitted" },
              error: null,
            }),
          }),
        };
      },
    }),
  });

  const { applyForJob } = await ctx.load("/lib/jobs.ts");
  const application = await applyForJob("job-1");

  assert.equal(payload.candidate_id, "candidate-1");
  assert.equal(payload.job_id, "job-1");
  assert.equal(payload.status, "submitted");
  assert.equal(application.id, "application-1");
});

test("expressJobInterest requires an authenticated candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });

  const { expressJobInterest } = await ctx.load("/lib/jobs.ts");
  await assert.rejects(() => expressJobInterest("job-1"), /PROFILE_REQUIRED/);
});

test("createPrivacyRequest requires an authenticated candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });

  const { createPrivacyRequest } = await ctx.load("/lib/jobs.ts");
  await assert.rejects(() => createPrivacyRequest("deletion"), /PROFILE_REQUIRED/);
});

test("createPrivacyRequest records the request for the authenticated candidate", async (t) => {
  const ctx = await createTestContext();
  t.after(() => ctx.close());

  let inserted = null;
  ctx.mockSupabase({
    auth: { getUser: async () => ({ data: { user: { id: "candidate-1" } } }) },
    from: () => ({
      insert: (payload) => {
        inserted = payload;
        return createQueryChain({ data: null, error: null });
      },
    }),
  });

  const { createPrivacyRequest } = await ctx.load("/lib/jobs.ts");
  await createPrivacyRequest("deletion");

  assert.deepEqual(inserted, {
    candidate_id: "candidate-1",
    request_type: "deletion",
  });
});
