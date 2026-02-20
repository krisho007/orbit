import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

export type AIProvider = "google" | "groq";

const DEFAULT_MODELS: Record<AIProvider, string> = {
  google: "gemini-flash-lite-latest",
  groq: "llama-3.1-8b-instant",
};

const groq = createGroq();

export function getProvider(): AIProvider {
  const raw = process.env.AI_PROVIDER || "google";
  if (raw === "google" || raw === "groq") return raw;
  console.warn(`[assistant:model] Unknown AI_PROVIDER "${raw}", falling back to google`);
  return "google";
}

export function getModel() {
  const provider = getProvider();
  const modelName = process.env.AI_MODEL || DEFAULT_MODELS[provider];

  if (provider === "groq") {
    return groq(modelName);
  }
  return google(modelName);
}

export function getProviderApiKeyEnvGuard(): { configured: boolean; message: string } {
  const provider = getProvider();

  if (provider === "groq") {
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
