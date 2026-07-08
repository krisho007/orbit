// Public image-serving route — streams contact/user image bytes stored in Neon.
//
// Deliberately unauthenticated: images are addressed by an unguessable UUID
// (a capability URL), mirroring the previous Supabase signed-URL model, so that
// plain <Image src> tags on native and web can load them without auth headers.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, imageBlobs } from "../db";

const app = new Hono();

app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [blob] = await db
    .select({ data: imageBlobs.data, contentType: imageBlobs.contentType })
    .from(imageBlobs)
    .where(eq(imageBlobs.id, id))
    .limit(1);

  if (!blob) {
    return c.json({ error: "Not found" }, 404);
  }

  return new Response(new Uint8Array(blob.data), {
    status: 200,
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export default app;
