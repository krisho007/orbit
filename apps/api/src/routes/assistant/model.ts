import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";

export type AIProvider = "google" | "groq" | "finetuned" | "google_structured";

const DEFAULT_MODELS: Record<AIProvider, string> = {
  google: "gemini-flash-lite-latest",
  groq: "llama-3.1-8b-instant",
  finetuned: "your-org/orbit-assistant-v1",
  google_structured: "gemini-flash-lite-latest",
};

const groq = createGroq();

export function getProvider(): AIProvider {
  const raw = process.env.AI_PROVIDER || "google";
  if (raw === "google" || raw === "groq" || raw === "finetuned" || raw === "google_structured") return raw;
  console.warn(`[assistant:model] Unknown AI_PROVIDER "${raw}", falling back to google`);
  return "google";
}

export function isFinetunedProvider(): boolean {
  return getProvider() === "finetuned";
}

export function isStructuredProvider(): boolean {
  return getProvider() === "google_structured";
}

export function getModelName(): string {
  const provider = getProvider();
  return process.env.AI_MODEL || DEFAULT_MODELS[provider];
}

export function getModel() {
  const provider = getProvider();
  const modelName = getModelName();

  if (provider === "groq") {
    return groq(modelName);
  }
  return google(modelName);
}

export function getClassificationModel() {
  const provider = getProvider();
  const modelName =
    process.env.AI_CLASSIFICATION_MODEL ||
    process.env.AI_MODEL ||
    DEFAULT_MODELS[provider];

  if (provider === "groq") {
    return groq(modelName);
  }
  return google(modelName);
}

// ── Fine-tuned model (OpenAI-compatible API via Together.ai) ────────

let togetherClient: ReturnType<typeof createOpenAI> | null = null;

function getTogetherClient() {
  if (!togetherClient) {
    togetherClient = createOpenAI({
      apiKey: process.env.TOGETHER_API_KEY || "",
      baseURL: "https://api.together.xyz/v1",
    });
  }
  return togetherClient;
}

export function getFinetunedModelName(): string {
  return process.env.TOGETHER_MODEL || DEFAULT_MODELS.finetuned;
}

export function getFinetunedModel() {
  const client = getTogetherClient();
  const modelName = getFinetunedModelName();
  return client(modelName);
}

export function getProviderApiKeyEnvGuard(): { configured: boolean; message: string } {
  const provider = getProvider();

  if (provider === "finetuned") {
    if (!process.env.TOGETHER_API_KEY) {
      return {
        configured: false,
        message: "Assistant is not configured. Set TOGETHER_API_KEY in apps/api/.env to enable the fine-tuned model.",
      };
    }
  } else if (provider === "google_structured") {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return {
        configured: false,
        message: "Assistant is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in apps/api/.env to enable LLM features.",
      };
    }
  } else if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) {
      return {
        configured: false,
        message: "Assistant is not configured. Set GROQ_API_KEY in apps/api/.env to enable LLM features.",
      };
    }
  } else {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return {
        configured: false,
        message: "Assistant is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in apps/api/.env to enable LLM features.",
      };
    }
  }

  return { configured: true, message: "" };
}
