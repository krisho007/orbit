import { google } from "@ai-sdk/google";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TITLE_MODEL = "gemini-2.5-flash-lite";

export function getModelName(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

export function getModel() {
  return google(getModelName());
}

export function getTitleModel() {
  return google(process.env.AI_TITLE_MODEL || DEFAULT_TITLE_MODEL);
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
