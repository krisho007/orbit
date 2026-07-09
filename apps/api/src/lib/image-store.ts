// Image storage in Neon (replaces Supabase Storage).
//
// Bytes are stored in the `image_blobs` table and served back publicly via the
// unguessable capability URL `/api/images/:id` (see routes/images.ts) — the same
// "hard-to-guess URL, no auth header needed" model the old Supabase signed URLs
// provided, so <Image> tags on native/web can load them directly.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, imageBlobs } from "../db";

/** SHA-256 hex of image bytes, used to detect whether a photo has changed. */
export function imageContentHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

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
 * Relative capability URL for an image blob. The web app is served same-origin
 * by the API, so a relative path resolves correctly in every environment
 * (localhost in dev, myorbit360.com in prod) without baking in a host.
 */
export function imageBlobUrl(id: string): string {
  return `/api/images/${id}`;
}
