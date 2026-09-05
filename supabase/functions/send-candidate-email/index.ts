import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { corsHeaders } from "../_shared/cors.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  try {
    if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
    if (!userId) return json(request, { error: "AUTH_REQUIRED" }, 401);
    const membership = await ctx.supabase.from("backoffice_users").select("role").eq("user_id", userId).maybeSingle();
    if (membership.error || !membership.data) return json(request, { error: "STAFF_REQUIRED" }, 403);
    const body = await request.json();
    const recipient = String(body.recipient ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? "").trim();
    const candidateId = String(body.candidateId ?? "");
    if (!candidateId || !recipient || !subject || !text || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      return json(request, { error: "INVALID_EMAIL" }, 400);
    }
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (!apiKey || !from) return json(request, { error: "EMAIL_NOT_CONFIGURED" }, 503);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [recipient], subject, text }),
    });
    const result = await response.json().catch(() => ({}));
    const status = response.ok ? "sent" : "failed";
    const logged = await ctx.supabase.from("candidate_emails").insert({
      candidate_id: candidateId, created_by: userId, recipient, subject, body: text,
      status, sent_at: response.ok ? new Date().toISOString() : null,
    }).select("id,recipient,subject,body,status,created_at,sent_at").single();
    if (logged.error) throw logged.error;
    if (!response.ok) return json(request, { error: "EMAIL_PROVIDER_FAILED", detail: result, email: logged.data }, 502);
    return json(request, { email: logged.data });
  } catch (error) {
    console.error(error);
    return json(request, { error: "EMAIL_SEND_FAILED" }, 500);
  }
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    return handler(request);
  },
};
