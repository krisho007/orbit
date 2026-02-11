// Speech-to-Text API Route (Sarvam AI proxy)
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

/**
 * POST /api/speech/transcribe
 * Accepts multipart/form-data with an "audio" file field.
 * Forwards the audio to Sarvam AI and returns the transcript.
 */
app.post("/transcribe", async (c) => {
  console.log("[Speech] POST /transcribe - request received");

  if (!SARVAM_API_KEY) {
    console.error("[Speech] SARVAM_API_KEY not configured");
    return c.json({ error: "Speech-to-text service not configured" }, 500);
  }

  const body = await c.req.parseBody();
  const audioFile = body["audio"];
  console.log("[Speech] Parsed body keys:", Object.keys(body));
  console.log("[Speech] Audio file present:", !!audioFile, "is File:", audioFile instanceof File);

  if (!audioFile || !(audioFile instanceof File)) {
    console.error("[Speech] Invalid audio file. Type:", typeof audioFile);
    return c.json({ error: "Missing or invalid 'audio' file in request" }, 400);
  }

  console.log(
    "[Speech] Audio file - name:",
    audioFile.name,
    "size:",
    audioFile.size,
    "type:",
    audioFile.type
  );
  if (audioFile.size === 0) {
    console.warn("[Speech] Audio file is empty (0 bytes)");
  } else if (audioFile.size < 1024) {
    console.warn("[Speech] Audio file is very small:", audioFile.size, "bytes");
  }

  try {
    // Build multipart form for Sarvam API
    const formData = new FormData();
    formData.append("file", audioFile, audioFile.name || "recording.wav");
    formData.append("model", "saaras:v3");
    formData.append("mode", "transcribe");

    console.log("[Speech] Forwarding to Sarvam API...");
    const response = await fetch(SARVAM_STT_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": SARVAM_API_KEY,
      },
      body: formData,
    });

    console.log("[Speech] Sarvam response status:", response.status);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      console.error("[Speech] Sarvam API error:", response.status, JSON.stringify(errorBody));
      return c.json(
        {
          error:
            errorBody?.error?.message ||
            `Speech-to-text failed (${response.status})`,
        },
        response.status as any
      );
    }

    const result = await response.json();
    console.log("[Speech] Sarvam result:", JSON.stringify(result));
    return c.json({ transcript: result.transcript || "" });
  } catch (err) {
    console.error("[Speech] Error:", err);
    return c.json({ error: "Failed to transcribe audio" }, 500);
  }
});

export default app;
