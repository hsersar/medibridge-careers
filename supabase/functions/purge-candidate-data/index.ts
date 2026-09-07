import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { removeObject } from "../_shared/r2.ts";

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const membership = await ctx.supabase.from("backoffice_users").select("role").eq("user_id", userId).maybeSingle();
  if (membership.error || membership.data?.role !== "admin") return new Response("Forbidden", { status: 403 });
  const requests = await ctx.supabase.from("data_subject_requests").select("id,candidate_id,candidate_reference,created_at").not("candidate_id", "is", null).eq("status", "received").eq("request_type", "deletion").limit(25);
  if (requests.error) return new Response("Query failed", { status: 500 });
  const outcomes: Array<{requestId:string;status:"completed"|"failed"}> = [];
  for (const item of requests.data ?? []) {
    const candidate = await ctx.supabaseAdmin.from("candidates").select("reference_number,avatar_path").eq("id", item.candidate_id).maybeSingle();
    const documents = await ctx.supabaseAdmin.from("candidate_documents").select("storage_path,storage_provider,storage_bucket").eq("candidate_id", item.candidate_id);
    try {
      await ctx.supabaseAdmin.from("data_subject_requests").update({ status: "processing" }).eq("id", item.id);
      for (const document of documents.data ?? []) {
        if (document.storage_provider === "supabase") {
          const removed = await ctx.supabaseAdmin.storage.from(document.storage_bucket).remove([document.storage_path]);
          if (removed.error) throw removed.error;
        } else if (document.storage_provider === "r2") {
          await removeObject(document.storage_path);
        }
      }
      if (candidate.data?.avatar_path) {
        const avatar = await ctx.supabaseAdmin.storage.from("candidate-avatars").remove([candidate.data.avatar_path]);
        if (avatar.error) throw avatar.error;
      }
      const receipt = await ctx.supabaseAdmin.from("privacy_deletion_receipts").upsert({
        request_id: item.id,
        candidate_reference: item.candidate_reference ?? candidate.data?.reference_number ?? null,
        requested_at: item.created_at,
        deleted_by: userId,
        metadata: { document_count: documents.data?.length ?? 0 },
      }, { onConflict: "request_id" });
      if (receipt.error) throw receipt.error;
      const deletedUser = await ctx.supabaseAdmin.auth.admin.deleteUser(item.candidate_id);
      if (deletedUser.error) throw deletedUser.error;
      const completed = await ctx.supabaseAdmin.from("data_subject_requests").update({ status: "completed", completed_at: new Date().toISOString(), requester_email: null }).eq("id", item.id);
      if (completed.error) throw completed.error;
      outcomes.push({requestId:item.id,status:"completed"});
    } catch (error) {
      console.error("Candidate purge failed", item.id, error);
      await ctx.supabaseAdmin.from("data_subject_requests").update({ status: "received" }).eq("id", item.id);
      outcomes.push({requestId:item.id,status:"failed"});
    }
  }
  return Response.json({ processed: outcomes.filter(item=>item.status==="completed").length, outcomes });
});

export default { fetch: handler };
