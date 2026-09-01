const defaultOrigins = [
  "https://medibridge-careers.vercel.app",
  "https://medibridge-careers.hi-sersar.chatgpt.site",
  "http://localhost:3000",
  "http://localhost:4173",
];

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const configured = (Deno.env.get("DOCUMENTS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set([...defaultOrigins, ...configured]);

  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : defaultOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
