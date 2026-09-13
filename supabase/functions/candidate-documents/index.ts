import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { corsHeaders } from "../_shared/cors.ts";
import {
  inspectObject,
  downloadObject,
  r2Bucket,
  removeObject,
  signDownload,
  signUpload,
} from "../_shared/r2.ts";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const allowedDocumentTypes = new Set(["passport", "qualification", "language", "reference", "general"]);
const maxSize = 10 * 1024 * 1024;
const selection = "id,candidate_id,document_type,file_name,storage_path,storage_provider,storage_bucket,mime_type,file_size,verification_status,verification_note,created_at,updated_at";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

function safeName(name: string) {
  return name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-140) || "document";
}

async function scanObject(key: string, mimeType: string) {
  const scanner = Deno.env.get("DOCUMENT_SCANNER_URL");
  const token = Deno.env.get("DOCUMENT_SCANNER_TOKEN");
  const provider = (Deno.env.get("DOCUMENT_SCANNER_PROVIDER") ??
    (scanner?.includes("cloudmersive.com") ? "cloudmersive" : "generic")).toLowerCase();
  if (!scanner || !token) throw new Error("DOCUMENT_SCANNER_NOT_CONFIGURED");
  const object = await downloadObject(key);
  let body: BodyInit;
  let headers: Record<string, string>;
  if (provider === "cloudmersive") {
    const form = new FormData();
    form.append("inputFile", new Blob([object], { type: mimeType }), key.split("/").at(-1) ?? "document");
    body = form;
    headers = { Apikey: token };
  } else {
    body = object;
    headers = { Authorization: "Bearer " + token, "Content-Type": mimeType };
  }
  const response = await fetch(scanner, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("DOCUMENT_SCANNER_FAILED");
  const result = await response.json().catch(() => ({}));
  const clean = provider === "cloudmersive" ? result.CleanResult === true : result.clean === true;
  if (!clean) throw new Error("MALWARE_DETECTED");
  return String(result.provider ?? provider);
}

const authenticated = withSupabase({ auth: "user" }, async (request, ctx) => {
  try {
    if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);
    const client = ctx.supabase;
    const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id;
    if (!userId || ctx.userClaims?.is_anonymous === true) return json(request, { error: "AUTH_REQUIRED" }, 401);

    const payload = await request.json();
    const action = String(payload.action ?? "");

    if (action === "create-upload") {
      const documentType = String(payload.documentType ?? "");
      const fileName = String(payload.fileName ?? "");
      const mimeType = String(payload.mimeType ?? "");
      const fileSize = Number(payload.fileSize ?? 0);
      if (!allowedDocumentTypes.has(documentType)) return json(request, { error: "INVALID_DOCUMENT_TYPE" }, 400);
      if (!allowedTypes.has(mimeType)) return json(request, { error: "INVALID_FILE_TYPE" }, 400);
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > maxSize) {
        return json(request, { error: "FILE_TOO_LARGE" }, 400);
      }
      const key = `${userId}/${documentType}/${crypto.randomUUID()}-${safeName(fileName)}`;
      return json(request, {
        key,
        uploadUrl: await signUpload(key, mimeType),
        expiresIn: 300,
        headers: { "Content-Type": mimeType },
      });
    }

    if (action === "finalize-upload") {
      const key = String(payload.key ?? "");
      const documentType = String(payload.documentType ?? "");
      const fileName = String(payload.fileName ?? "");
      const mimeType = String(payload.mimeType ?? "");
      const fileSize = Number(payload.fileSize ?? 0);
      if (!key.startsWith(`${userId}/${documentType}/`) || !allowedDocumentTypes.has(documentType)) {
        return json(request, { error: "INVALID_OBJECT_KEY" }, 403);
      }
      if (!allowedTypes.has(mimeType) || fileSize <= 0 || fileSize > maxSize) {
        return json(request, { error: "INVALID_FILE" }, 400);
      }
      const object = await inspectObject(key);
      if (Number(object.ContentLength ?? -1) !== fileSize || object.ContentType !== mimeType) {
        await removeObject(key);
        return json(request, { error: "OBJECT_VALIDATION_FAILED" }, 400);
      }
      let scanProvider = "";
      try {
        scanProvider = await scanObject(key, mimeType);
      } catch (error) {
        await removeObject(key);
        return json(request, { error: error instanceof Error && error.message === "MALWARE_DETECTED" ? "MALWARE_DETECTED" : "DOCUMENT_SCAN_FAILED" }, 422);
      }
      const existing = await client.from("candidate_documents").select(selection).eq("storage_path", key).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return json(request, { document: existing.data });
      const inserted = await client.from("candidate_documents").insert({
        candidate_id: userId,
        document_type: documentType,
        file_name: fileName,
        storage_path: key,
        storage_provider: "r2",
        storage_bucket: r2Bucket(),
        mime_type: mimeType,
        file_size: fileSize,
        verification_status: "pending",
        scan_status: "clean",
        scanned_at: new Date().toISOString(),
        scan_provider: scanProvider,
      }).select(selection).single();
      if (inserted.error) {
        await removeObject(key);
        throw inserted.error;
      }
      return json(request, { document: inserted.data }, 201);
    }

    if (action === "download") {
      const documentId = String(payload.documentId ?? "");
      const result = await client.from("candidate_documents").select(selection).eq("id", documentId).single();
      if (result.error || !result.data) return json(request, { error: "DOCUMENT_NOT_FOUND" }, 404);
      if (result.data.storage_provider !== "r2") return json(request, { error: "LEGACY_STORAGE" }, 409);
      return json(request, {
        url: await signDownload(result.data.storage_path, result.data.file_name, Boolean(payload.download)),
        expiresIn: 300,
      });
    }

    if (action === "delete") {
      const documentId = String(payload.documentId ?? "");
      const result = await client.from("candidate_documents").select(selection).eq("id", documentId).single();
      if (result.error || !result.data) return json(request, { error: "DOCUMENT_NOT_FOUND" }, 404);
      if (result.data.candidate_id && result.data.candidate_id !== userId) {
        return json(request, { error: "FORBIDDEN" }, 403);
      }
      const deleted = await client.from("candidate_documents").delete().eq("id", documentId);
      if (deleted.error) throw deleted.error;
      if (result.data.storage_provider === "r2") await removeObject(result.data.storage_path);
      return json(request, { deleted: true });
    }

    return json(request, { error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return json(request, { error: "DOCUMENT_OPERATION_FAILED" }, 500);
  }
});

const candidateDocumentsWorker = {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    return authenticated(request);
  },
};

export default candidateDocumentsWorker;
