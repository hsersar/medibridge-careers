import assert from "node:assert/strict";
import test from "node:test";

// Regression test for the built vinext worker (`npm run build`, see
// scripts/build-verified.sh): verifies the candidate landing page actually
// renders MediBridge markup, not just "some HTML". Previously this only
// checked for a `codex-preview` meta tag that is injected by the OpenAI
// "Sites" sandbox platform and is absent from every real deployment (Vercel,
// local, staging), so the assertion never exercised production output.
test("renders the MediBridge candidate landing page", async () => {
  const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );

  const html = await response.text();
  assert.match(html, /<title>MediBridge Careers<\/title>/);
  assert.match(
    html,
    /name="description" content="Your trusted path to a healthcare career in Germany\."/,
  );
  assert.match(html, /class="welcome-shell"/);
  assert.match(html, /medibridge-logo\.svg/);
});
