#!/usr/bin/env bun
/**
 * One-off migration: copy contact image bytes from Supabase Storage into Neon.
 *
 * Run ONCE, after the Postgres data has been restored into Neon and the
 * 0018 migration has been applied (so `image_blobs` exists and `contact_images`
 * rows are present with their legacy Supabase `publicId` file paths).
 *
 * For each contact_images row it:
 *   1. downloads the object from the Supabase Storage bucket (by publicId),
 *   2. inserts the bytes into Neon `image_blobs`,
 *   3. rewrites contact_images.imageUrl → /api/images/:id and publicId → :id.
 *
 * Required env:
 *   DATABASE_URL                 — Neon (already the app default)
 *   SUPABASE_URL                 — old Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — old Supabase service role key (Storage read)
 *   SUPABASE_STORAGE_BUCKET      — optional, defaults to "orbit"
 *   BETTER_AUTH_URL              — public API base, for the rewritten imageUrl
 *
 * Usage:
 *   cd apps/api
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/migrate-images-to-neon.ts
 */
import { eq } from "drizzle-orm";
import { db, contactImages } from "../src/db";
import { storeImageBlob, imageBlobUrl } from "../src/lib/image-store";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "orbit";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (needed to read the old Storage bucket)."
  );
  process.exit(1);
}

async function downloadObject(
  path: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY!,
    },
  });
  if (!res.ok) {
    console.warn(`  ✗ download failed for "${path}": ${res.status}`);
    return null;
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType };
}

async function main() {
  const rows = await db
    .select({ id: contactImages.id, contactId: contactImages.contactId, publicId: contactImages.publicId })
    .from(contactImages);

  console.log(`Found ${rows.length} contact image rows.`);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Already-migrated rows point at /api/images/... — skip.
    if (!row.publicId || row.publicId.length === 36) {
      skipped++;
      continue;
    }

    const obj = await downloadObject(row.publicId);
    if (!obj) {
      skipped++;
      continue;
    }

    const blobId = await storeImageBlob({
      data: obj.data,
      contentType: obj.contentType,
      contactId: row.contactId,
    });

    await db
      .update(contactImages)
      .set({ imageUrl: imageBlobUrl(blobId), publicId: blobId })
      .where(eq(contactImages.id, row.id));

    migrated++;
    if (migrated % 25 === 0) console.log(`  … ${migrated} migrated`);
  }

  console.log(`Done. Migrated ${migrated}, skipped ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Image migration failed:", err);
  process.exit(1);
});
