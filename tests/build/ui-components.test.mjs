import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Only `components/ui/progress.tsx` is exercised here: it is the one
// shadcn/UI-kit primitive actually rendered by the app (the candidate
// dashboard/intake completion bars in app/page.tsx). `chart.tsx` and
// `sidebar.tsx` are vendored starter demo components with no import anywhere
// under app/, so tests for them exercised dead code rather than MediBridge
// behavior; the CSS "animation and scrolling utilities" catalog check below
// was similarly generic and asserted starter demo classes (e.g.
// scrollbar-thin) that Tailwind purges from the production build because the
// app doesn't use them.
const root = fileURLToPath(new URL("../..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("builds the candidate dashboard and jobs-admin styles", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  // Candidate application-progress bar (app/page.tsx Dashboard/Intake views).
  assert.match(css, /\.profile-progress\{/);
  assert.match(css, /\.intake-progress\{/);
  // Candidate landing page shell (app/page.tsx).
  assert.match(css, /\.welcome-shell\{/);
  // Backoffice job-posting admin screen (app/backoffice/jobs).
  assert.match(css, /\.jobs-admin\{/);
  // Candidate privacy/data-subject request page (app/privacy).
  assert.match(css, /\.privacy-page\{/);
});
