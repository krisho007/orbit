// Speech-to-Text API Route (Sarvam AI proxy)
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";

const app = new Hono();

app.use("/*", authMiddleware);

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";
const SPEECH_DUMP_AUDIO = ["1", "true", "yes"].includes(
  (process.env.SPEECH_DUMP_AUDIO || "").toLowerCase()
);
const SPEECH_DUMP_DIR = process.env.SPEECH_DUMP_DIR || "/tmp/orbit-speech-dumps";

type SarvamErrorPayload = {
  error?: {
    message?: string;
  };
};

type SarvamSuccessPayload = {
  transcript?: string;
};

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "unknown";
}

async function maybeDumpUploadedAudio(
  file: File,
  userId: string
): Promise<string | null> {
  if (!SPEECH_DUMP_AUDIO) {
    return null;
  }

  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : "";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeUser = sanitizeSegment(userId);
  const safeExt = sanitizeSegment(ext || ".bin");
  const fileName = `${timestamp}_${safeUser}_${crypto.randomUUID()}${safeExt}`;
  const dumpPath = join(SPEECH_DUMP_DIR, fileName);

  await mkdir(SPEECH_DUMP_DIR, { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(dumpPath, bytes);

  return dumpPath;
}

/**
 * POST /api/speech/transcribe
 * Accepts multipart/form-data with an "audio" file field.
 * Forwards the audio to Sarvam AI and returns the transcript.
 */
app.post("/transcribe", async (c) => {
  console.log("[Speech] POST /transcribe - request received");
  const userId = c.get("userId");

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
    const dumpPath = await maybeDumpUploadedAudio(audioFile, userId).catch((err) => {
      console.error("[Speech] Failed to dump uploaded audio:", err);
      return null;
    });
    if (dumpPath) {
      console.log("[Speech] Dumped uploaded audio to:", dumpPath);
    }

    console.log(
      "[Speech] Forwarding file - name:",
      audioFile.name,
      "size:",
      audioFile.size,
      "type:",
      audioFile.type
    );

    // Build multipart form for Sarvam API
    const formData = new FormData();
    formData.append(
      "file",
      audioFile,
      audioFile.name || "recording.aac"
    );
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
      const parsedError = await response.json().catch(() => ({}));
      const errorBody = parsedError as SarvamErrorPayload;
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

    const parsedResult = await response.json().catch(() => ({}));
    const result = parsedResult as SarvamSuccessPayload;
    console.log("[Speech] Sarvam result:", JSON.stringify(result));
    return c.json({ transcript: result.transcript || "" });
  } catch (err) {
    console.error("[Speech] Error:", err);
    return c.json({ error: "Failed to transcribe audio" }, 500);
  }
});

export default app;
