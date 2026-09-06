import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const membership = await ctx.supabase.from("backoffice_users").select("role").eq("user_id", userId).maybeSingle();
  if (membership.error || membership.data?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const requests = await ctx.supabase.from("data_subject_requests").select("id,candidate_id").eq("status", "received").eq("request_type", "deletion").limit(25);
  if (requests.error) return new Response("Query failed", { status: 500 });
  for (const item of requests.data ?? []) {
    const documents = await ctx.supabaseAdmin.from("candidate_documents").select("storage_path,storage_provider,storage_bucket").eq("candidate_id", item.candidate_id);
    for (const document of documents.data ?? []) {
      if (document.storage_provider === "supabase") {
        await ctx.supabaseAdmin.storage.from(document.storage_bucket).remove([document.storage_path]);
      }
    }
    await ctx.supabase.from("candidates").delete().eq("id", item.candidate_id);
    await ctx.supabase.from("data_subject_requests").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.id);
  }
  return Response.json({ processed: requests.data?.length ?? 0 });
});

export default { fetch: handler };
