export function extractLastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown };
    if (message?.role !== "user") continue;

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      const textParts = message.content
        .map((part: any) => (part?.type === "text" ? part.text : ""))
        .filter((part) => typeof part === "string" && part.length > 0);
      if (textParts.length > 0) return textParts.join(" ").trim();
    }
  }
  return "";
}
