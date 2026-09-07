import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { GoogleAuth } from "npm:google-auth-library@10.3.0";
import { corsHeaders } from "../_shared/cors.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json" } });
}

const authenticated = withSupabase({ auth: "user" }, async (request, ctx) => {
  try {
    if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
    if (!userId) return json(request, { error: "AUTH_REQUIRED" }, 401);
    const membership = await ctx.supabase.from("backoffice_users").select("role").eq("user_id", userId).maybeSingle();
    if (membership.error || !membership.data) return json(request, { error: "FORBIDDEN" }, 403);

    const { notificationId } = await request.json();
    const notification = await ctx.supabase.from("candidate_notifications").select("id,candidate_id,title,message").eq("id", String(notificationId ?? "")).single();
    if (notification.error || !notification.data) return json(request, { error: "NOTIFICATION_NOT_FOUND" }, 404);
    const tokens = await ctx.supabaseAdmin.from("candidate_device_tokens").select("id,token").eq("candidate_id", notification.data.candidate_id).eq("enabled", true);
    if (tokens.error) throw tokens.error;
    if (!tokens.data?.length) return json(request, { delivered: 0, failed: 0 });

    const credentialsJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!credentialsJson) return json(request, { error: "FIREBASE_NOT_CONFIGURED" }, 503);
    const credentials = JSON.parse(credentialsJson);
    const projectId = credentials.project_id;
    if (!projectId) return json(request, { error: "FIREBASE_PROJECT_MISSING" }, 503);
    const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    if (!accessToken.token) throw new Error("FCM_ACCESS_TOKEN_FAILED");

    let delivered = 0;
    let failed = 0;
    for (const device of tokens.data) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: device.token, notification: { title: notification.data.title, body: notification.data.message }, data: { notificationId: notification.data.id } } }),
      });
      if (response.ok) delivered += 1;
      else {
        failed += 1;
        if (response.status === 404) await ctx.supabaseAdmin.from("candidate_device_tokens").update({ enabled: false }).eq("id", device.id);
      }
    }
    return json(request, { delivered, failed });
  } catch (error) {
    console.error(error);
    return json(request, { error: "PUSH_OPERATION_FAILED" }, 500);
  }
});

const handler = {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    return authenticated(request);
  },
};

export default handler;
