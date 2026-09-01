import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.883.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.883.0";

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export const r2Bucket = () => required("R2_BUCKET_NAME");

export function r2Client() {
  const accountId = required("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: Deno.env.get("R2_ENDPOINT") ||
      `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function signUpload(key: string, contentType: string) {
  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: r2Bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

export async function signDownload(key: string, fileName: string, download: boolean) {
  const disposition = download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : "inline";
  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: 300 },
  );
}

export async function inspectObject(key: string) {
  return r2Client().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }));
}

export async function removeObject(key: string) {
  await r2Client().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key }));
}

export async function putObject(key: string, body: Uint8Array, contentType?: string) {
  await r2Client().send(new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}
