import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { corsHeaders } from "../_shared/cors.ts";

const selection = "id,candidate_id,recipient,subject,body,status,created_at,sent_at,provider_message_id,delivery_status";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

async function deliver(recipient: string, subject: string, body: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? Deno.env.get("EMAIL_FROM_ADDRESS");
  if (!apiKey) throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  if (!from) throw new Error("EMAIL_FROM_ADDRESS_NOT_CONFIGURED");
  const authHeader = "Bearer " + apiKey;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [recipient], subject, text: body }),
  });
  if (!response.ok) throw new Error(`EMAIL_PROVIDER_ERROR_${response.status}`);
  const result = await response.json().catch(() => ({}));
  if (!result.id) throw new Error("EMAIL_PROVIDER_INVALID_RESPONSE");
  return String(result.id);
}

const authenticated = withSupabase({ auth: "user" }, async (request, ctx) => {
  try {
    if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
    const client = ctx.supabase;
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
    if (!userId) return json(request, { error: "AUTH_REQUIRED" }, 401);

    const payload = await request.json();
    const emailId = String(payload.emailId ?? "");
    if (!emailId) return json(request, { error: "EMAIL_ID_REQUIRED" }, 400);

    const existing = await client.from("candidate_emails").select(selection).eq("id", emailId).single();
    if (existing.error || !existing.data) return json(request, { error: "EMAIL_NOT_FOUND" }, 404);
    if (existing.data.status === "sent") return json(request, { email: existing.data });

    try {
      const providerMessageId = await deliver(existing.data.recipient, existing.data.subject, existing.data.body);
      const sent = await client.from("candidate_emails").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
        delivery_status: "queued",
      }).eq("id", emailId).select(selection).single();
      if (sent.error) throw sent.error;
      return json(request, { email: sent.data });
    } catch (deliveryError) {
      console.error(deliveryError);
      const failed = await client.from("candidate_emails").update({ status: "failed" }).eq("id", emailId).select(selection).single();
      if (failed.error) throw failed.error;
      return json(request, { email: failed.data, error: "DELIVERY_FAILED" }, 502);
    }

  } catch (error) {
    console.error(error);
    return json(request, { error: "EMAIL_OPERATION_FAILED" }, 500);
  }
});

const emailWorker = {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    return authenticated(request);
  },
};

export default emailWorker;
