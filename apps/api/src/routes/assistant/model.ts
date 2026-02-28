import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export type AIProvider = "finetuned" | "google_structured" | "cerebras";

const DEFAULT_MODELS: Record<AIProvider, string> = {
  finetuned: "your-org/orbit-assistant-v1",
  google_structured: "gemini-flash-lite-latest",
  cerebras: "llama3.1-8b",
};

export function getProvider(): AIProvider {
  const raw = process.env.AI_PROVIDER || "cerebras";
  if (raw === "finetuned" || raw === "google_structured" || raw === "cerebras") return raw;
  console.warn(`[assistant:model] Unknown AI_PROVIDER "${raw}", falling back to cerebras`);
  return "cerebras";
}

export function isFinetunedProvider(): boolean {
  return getProvider() === "finetuned";
}

export function isStructuredProvider(): boolean {
  return getProvider() === "google_structured" || getProvider() === "cerebras";
}

export function getModelName(): string {
  const provider = getProvider();
  return process.env.AI_MODEL || DEFAULT_MODELS[provider];
}

export function getModel() {
  const provider = getProvider();
  const modelName = getModelName();

  if (provider === "cerebras") {
    return getCerebrasClient().chat(modelName);
  }
  return google(modelName);
}

// ── Cerebras (OpenAI-compatible API) ─────────────────────────────────

let cerebrasClient: ReturnType<typeof createOpenAI> | null = null;

function getCerebrasClient() {
  if (!cerebrasClient) {
    cerebrasClient = createOpenAI({
      apiKey: process.env.CEREBRAS_API_KEY || "",
      baseURL: "https://api.cerebras.ai/v1",
    });
  }
  return cerebrasClient;
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
  return client.chat(modelName);
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
  } else if (provider === "cerebras") {
    if (!process.env.CEREBRAS_API_KEY) {
      return {
        configured: false,
        message: "Assistant is not configured. Set CEREBRAS_API_KEY in apps/api/.env to enable the Cerebras model.",
      };
    }
  }

  return { configured: true, message: "" };
}
