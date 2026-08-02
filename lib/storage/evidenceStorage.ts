import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const DEFAULT_EVIDENCE_BUCKET = "evidence-files";

export function getEvidenceBucketName(): string {
  return (
    process.env.SUPABASE_EVIDENCE_BUCKET?.trim() || DEFAULT_EVIDENCE_BUCKET
  );
}

export function sha256Buffer(
  buffer: Buffer | Uint8Array | ArrayBuffer | string,
): string {
  const hash = createHash("sha256");
  if (typeof buffer === "string") {
    hash.update(buffer);
  } else if (buffer instanceof ArrayBuffer) {
    hash.update(Buffer.from(buffer));
  } else {
    hash.update(Buffer.from(buffer));
  }
  return hash.digest("hex");
}

export async function assertEvidenceBucketAccessible(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const bucket = getEvidenceBucketName();

  const { data, error } = await supabase.storage.getBucket(bucket);
  if (error) {
    throw new Error(`Bucket access failed (${bucket}): ${error.message}`);
  }
  if (!data) {
    throw new Error(`Bucket not found: ${bucket}`);
  }
}

export interface UploadEvidenceFileParams {
  path: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType?: string;
  upsert?: boolean;
  bucket?: string;
}

export interface UploadEvidenceFileResult {
  bucket: string;
  path: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

export async function uploadEvidenceFile(
  params: UploadEvidenceFileParams,
): Promise<UploadEvidenceFileResult> {
  const supabase = createSupabaseServerClient();
  const bucket = params.bucket?.trim() || getEvidenceBucketName();
  const contentType = params.contentType || "application/octet-stream";

  let bytes: Buffer;
  if (typeof params.body === "string") {
    bytes = Buffer.from(params.body);
  } else if (params.body instanceof Blob) {
    bytes = Buffer.from(await params.body.arrayBuffer());
  } else {
    bytes = Buffer.from(params.body);
  }

  const sha256 = sha256Buffer(bytes);
  const { error } = await supabase.storage.from(bucket).upload(params.path, bytes, {
    contentType,
    upsert: params.upsert ?? true,
  });

  if (error) {
    throw new Error(`Upload failed (${bucket}/${params.path}): ${error.message}`);
  }

  return {
    bucket,
    path: params.path,
    contentType,
    byteSize: bytes.byteLength,
    sha256,
  };
}

/** @deprecated Prefer uploadEvidenceFile */
export async function uploadEvidenceObject(
  path: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType = "application/octet-stream",
): Promise<void> {
  await uploadEvidenceFile({ path, body, contentType });
}

export interface CreateSignedEvidenceUrlParams {
  path: string;
  expiresInSeconds?: number;
  bucket?: string;
}

export async function createSignedEvidenceUrl(
  params: CreateSignedEvidenceUrlParams,
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const bucket = params.bucket?.trim() || getEvidenceBucketName();
  const expiresIn = params.expiresInSeconds ?? 60 * 10;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(params.path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Signed URL failed (${bucket}/${params.path}): ${error?.message || "no url"}`,
    );
  }
  return data.signedUrl;
}

export interface DeleteEvidenceFileParams {
  path: string;
  bucket?: string;
}

export async function deleteEvidenceFile(
  params: DeleteEvidenceFileParams,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const bucket = params.bucket?.trim() || getEvidenceBucketName();
  const { error } = await supabase.storage.from(bucket).remove([params.path]);
  if (error) {
    throw new Error(`Delete failed (${bucket}/${params.path}): ${error.message}`);
  }
}

/** @deprecated Prefer deleteEvidenceFile */
export async function deleteEvidenceObject(path: string): Promise<void> {
  await deleteEvidenceFile({ path });
}
