// Image storage in Neon (replaces Supabase Storage).
//
// Bytes are stored in the `image_blobs` table and served back publicly via the
// unguessable capability URL `/api/images/:id` (see routes/images.ts) — the same
// "hard-to-guess URL, no auth header needed" model the old Supabase signed URLs
// provided, so <Image> tags on native/web can load them directly.
import { eq } from "drizzle-orm";
import { db, imageBlobs } from "../db";

export async function storeImageBlob(params: {
  data: Buffer;
  contentType: string;
  contactId?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(imageBlobs)
    .values({
      data: params.data,
      contentType: params.contentType,
      contactId: params.contactId ?? null,
    })
    .returning({ id: imageBlobs.id });
  return row!.id;
}

export async function deleteImageBlob(id: string): Promise<void> {
  await db.delete(imageBlobs).where(eq(imageBlobs.id, id));
}

/**
 * Absolute capability URL for an image blob. Prefers the configured public API
 * base (BETTER_AUTH_URL) so the URL is fully-qualified for native clients;
 * falls back to the incoming request's origin.
 */
export function imageBlobUrl(id: string, requestUrl?: string): string {
  const base =
    process.env.BETTER_AUTH_URL ||
    (requestUrl ? new URL(requestUrl).origin : "http://localhost:3001");
  return new URL(`/api/images/${id}`, base).toString();
}
