import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useMemo } from "react";
import { assistantApi } from "../api";

type Options = {
  conversationId: string;
  initialMessages?: UIMessage[];
  onFinish?: (event: { message: UIMessage }) => void;
  onError?: (error: Error) => void;
};

export function useAssistantChat({ conversationId, initialMessages, onFinish, onError }: Options) {
  const transport = useMemo(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new DefaultChatTransport({
      api: assistantApi.chatUrl(),
      // expo/fetch supports streaming response bodies on iOS / Android / Web.
      // React Native's built-in fetch does not — passing it here would break tool-call streaming.
      fetch: expoFetch as unknown as typeof fetch,
      // Send the Better Auth session cookie with the streamed chat request.
      credentials: "include",
      headers: async () => assistantApi.chatHeaders(),
      body: () => ({ conversationId, timezone }),
    });
  }, [conversationId]);

  return useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onFinish,
    onError,
  });
}
