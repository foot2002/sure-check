import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const DEFAULT_EVIDENCE_BUCKET = "evidence-files";

export function getEvidenceBucketName(): string {
  return (
    process.env.SUPABASE_EVIDENCE_BUCKET?.trim() || DEFAULT_EVIDENCE_BUCKET
  );
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

export async function uploadEvidenceObject(
  path: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType = "application/octet-stream",
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const bucket = getEvidenceBucketName();

  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed (${bucket}/${path}): ${error.message}`);
  }
}

export async function deleteEvidenceObject(path: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const bucket = getEvidenceBucketName();

  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`Delete failed (${bucket}/${path}): ${error.message}`);
  }
}
