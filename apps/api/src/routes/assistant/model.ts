import { google } from "@ai-sdk/google";

const MODEL = "gemini-2.5-flash";
const TITLE_MODEL = "gemini-2.5-flash-lite";

export function getModelName(): string {
  return MODEL;
}

export function getModel() {
  return google(MODEL);
}

export function getTitleModel() {
  return google(TITLE_MODEL);
}

export function getProviderApiKeyEnvGuard(): { configured: boolean; message: string } {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      configured: false,
      message: "Assistant is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in apps/api/.env to enable the assistant.",
    };
  }
  return { configured: true, message: "" };
}
