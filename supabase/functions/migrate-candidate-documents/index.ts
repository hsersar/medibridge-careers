import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { corsHeaders } from "../_shared/cors.ts";
import { putObject, r2Bucket } from "../_shared/r2.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

const authenticated = withSupabase({ auth: "user" }, async (request, ctx) => {
  try {
    if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
    const caller = ctx.supabase;
    const service = ctx.supabaseAdmin;
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
    if (!userId) return json(request, { error: "AUTH_REQUIRED" }, 401);
    const membership = await caller.from("backoffice_users").select("role").eq("user_id", userId).maybeSingle();
    if (membership.error || !membership.data || membership.data.role !== "admin") {
      return json(request, { error: "ADMIN_REQUIRED" }, 403);
    }
    const requestedLimit = Number((await request.json().catch(() => ({}))).limit ?? 25);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 25;
    const documents = await service.from("candidate_documents")
      .select("id,storage_path,mime_type")
      .eq("storage_provider", "supabase")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (documents.error) throw documents.error;

    const migrated: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const document of documents.data ?? []) {
      try {
        const downloaded = await service.storage.from("candidate-documents").download(document.storage_path);
        if (downloaded.error || !downloaded.data) throw downloaded.error ?? new Error("DOWNLOAD_FAILED");
        await putObject(
          document.storage_path,
          new Uint8Array(await downloaded.data.arrayBuffer()),
          document.mime_type ?? downloaded.data.type,
        );
        const updated = await service.from("candidate_documents").update({
          storage_provider: "r2",
          storage_bucket: r2Bucket(),
          migrated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", document.id).eq("storage_provider", "supabase");
        if (updated.error) throw updated.error;
        migrated.push(document.id);
      } catch (error) {
        failed.push({ id: document.id, error: error instanceof Error ? error.message : "MIGRATION_FAILED" });
      }
    }

    return json(request, {
      migrated,
      failed,
      remainingBatchAvailable: (documents.data?.length ?? 0) === limit,
      legacyObjectsRetainedForRollback: true,
    });
  } catch (error) {
    console.error(error);
    return json(request, { error: "MIGRATION_FAILED" }, 500);
  }
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    return authenticated(request);
  },
};
