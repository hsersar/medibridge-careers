import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Loads project source modules through Vite's SSR module graph so TypeScript
 * and extensionless imports (e.g. "./supabase") resolve exactly as they do at
 * runtime, without requiring a full application build.
 *
 * Each call returns an isolated Vite server plus a `mockSupabase` helper that
 * replaces methods on the shared `lib/supabase.ts` client singleton, so tests
 * never hit a real Supabase project.
 */
export async function createTestContext() {
  const vite = await createServer({
    appType: "custom",
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true, hmr: false },
  });

  const supabaseModule = await vite.ssrLoadModule("/lib/supabase.ts");

  async function load(path) {
    return vite.ssrLoadModule(path);
  }

  function mockSupabase(overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (key === "auth" || key === "storage" || key === "functions") {
        Object.assign(supabaseModule.supabase[key], value);
      } else {
        supabaseModule.supabase[key] = value;
      }
    }
  }

  async function close() {
    await vite.close();
  }

  return { load, mockSupabase, supabaseModule, close };
}

/** Builds a chainable query-builder mock resolving to `{ data, error }`. */
export function createQueryChain(result) {
  const resolved = Promise.resolve(result);
  const chain = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return resolved.then.bind(resolved);
        if (prop === "catch") return resolved.catch.bind(resolved);
        if (prop === "finally") return resolved.finally.bind(resolved);
        return () => chain;
      },
    },
  );
  return chain;
}
