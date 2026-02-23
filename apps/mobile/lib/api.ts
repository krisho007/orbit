import { Platform } from "react-native";
import { supabase } from "./supabase";

// Prefer explicit env for native builds; on web use relative URLs by default
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:3001");

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    return headers;
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const hasBaseUrl = this.baseUrl && this.baseUrl.length > 0;
    const url = hasBaseUrl
      ? new URL(path, this.baseUrl)
      : new URL(path, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return hasBaseUrl ? url.toString() : url.pathname + url.search;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, params } = options;

    const headers = await this.getAuthHeaders();
    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP error ${response.status}`);
    }

    return response.json();
  }

  // Convenience methods
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request<T>(path, { method: "GET", params });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "POST", body });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PUT", body });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PATCH", body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }

  /**
   * Stream a POST request using NDJSON. Calls `onStatus` for each status line
   * and returns the final result object.
   * Falls back to regular JSON if ReadableStream is unavailable.
   */
  async streamPost<T>(path: string, body: unknown, onStatus: (message: string) => void): Promise<T> {
    const headers = await this.getAuthHeaders();
    (headers as Record<string, string>)["Accept"] = "text/x-ndjson";
    const url = this.buildUrl(path);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP error ${response.status}`);
    }

    // If ReadableStream not available (e.g., React Native Android),
    // fall back to parsing the NDJSON body as text line-by-line
    if (!response.body) {
      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.trim());
      let fallbackResult: T | null = null;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.trim());
          if (parsed.type === "status") {
            onStatus(parsed.message);
          } else if (parsed.type === "result") {
            fallbackResult = parsed as T;
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Stream error");
          }
        } catch (e) {
          if (e instanceof Error && e.name === "SyntaxError") continue;
          throw e;
        }
      }
      if (!fallbackResult) throw new Error("No result received from response");
      return fallbackResult;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: T | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      // Process complete lines
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "status") {
            onStatus(parsed.message);
          } else if (parsed.type === "result") {
            result = parsed as T;
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Stream error");
          }
        } catch (e) {
          // Hermes (React Native) JSON.parse errors may not pass instanceof SyntaxError
          if (e instanceof Error && e.name === "SyntaxError") continue;
          throw e;
        }
      }

      if (done) break;
    }

    // Process any remaining buffer content (final line without trailing \n)
    const remaining = buffer.trim();
    if (remaining) {
      try {
        const parsed = JSON.parse(remaining);
        if (parsed.type === "result") {
          result = parsed as T;
        } else if (parsed.type === "error") {
          throw new Error(parsed.error || "Stream error");
        }
      } catch {
        // Ignore parse errors on trailing buffer
      }
    }

    if (!result) {
      throw new Error("No result received from stream");
    }
    return result;
  }
}

export const api = new ApiClient(API_URL);

// ============================================
// API Methods
// ============================================

// Contacts
export const contactsApi = {
  list: (params?: { cursor?: string; search?: string; limit?: number }) =>
    api.get<{
      contacts: Contact[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/contacts", params),

  get: (id: string) => api.get<Contact>(`/api/contacts/${id}`),

  create: (data: CreateContactData) =>
    api.post<Contact>("/api/contacts", data),

  update: (id: string, data: Partial<CreateContactData>) =>
    api.put<Contact>(`/api/contacts/${id}`, data),

  addImage: (id: string, data: { imageUrl: string; publicId?: string }) =>
    api.post<ContactImage>(`/api/contacts/${id}/images`, data),

  uploadImage: (
    id: string,
    data: { base64Data: string; contentType: string; fileName?: string }
  ) => api.post<ContactImage>(`/api/contacts/${id}/images/upload`, data),

  deleteImage: (contactId: string, imageId: string) =>
    api.delete<{ success: true }>(`/api/contacts/${contactId}/images/${imageId}`),

  fetchGoogleContacts: (data: { accessToken: string; includePhotos?: boolean }) =>
    api.post<{ contacts: GoogleImportContact[] }>("/api/contacts/google/fetch", data),

  importGoogleContactsBatch: (
    contacts: GoogleImportContact[],
    overrideExisting: boolean = false
  ) =>
    api.post<GoogleImportBatchResult>("/api/contacts/google/import/batch", {
      contacts,
      overrideExisting,
    }),

  searchByPhone: (params: {
    phone: string;
    include?: ("conversations" | "events" | "reminders")[];
    conversationsLimit?: number;
    eventsLimit?: number;
    remindersLimit?: number;
  }) =>
    api.get<ContactPhoneSearchResponse>("/api/contacts/search/phone", {
      phone: params.phone,
      include: params.include?.join(","),
      conversationsLimit: params.conversationsLimit,
      eventsLimit: params.eventsLimit,
      remindersLimit: params.remindersLimit,
    }),

  delete: (id: string) => api.delete(`/api/contacts/${id}`),
};

// Conversations
export const conversationsApi = {
  list: (params?: {
    cursor?: string;
    search?: string;
    medium?: string;
    limit?: number;
    semantic?: boolean;
  }) =>
    api.get<{
      conversations: Conversation[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/conversations", params),

  listByContacts: (params: {
    contactIds: string[];
    cursor?: string;
    search?: string;
    medium?: string;
    limit?: number;
  }) =>
    api.get<{
      conversations: Conversation[];
      nextCursor: string | null;
    }>("/api/conversations/by-contacts", {
      ...params,
      contactIds: params.contactIds.join(","),
    }),

  get: (id: string) => api.get<Conversation>(`/api/conversations/${id}`),

  create: (data: CreateConversationData) =>
    api.post<Conversation>("/api/conversations", data),

  update: (id: string, data: Partial<CreateConversationData>) =>
    api.put<Conversation>(`/api/conversations/${id}`, data),

  delete: (id: string) => api.delete(`/api/conversations/${id}`),
};

// Events
export const eventsApi = {
  list: (params?: {
    cursor?: string;
    search?: string;
    eventType?: string;
    upcoming?: boolean;
    semantic?: boolean;
    limit?: number;
  }) =>
    api.get<{
      events: Event[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/events", params),

  get: (id: string) => api.get<Event>(`/api/events/${id}`),

  listConversations: (
    id: string,
    params?: {
      cursor?: string;
      search?: string;
      medium?: string;
      limit?: number;
    }
  ) =>
    api.get<{
      conversations: Conversation[];
      nextCursor: string | null;
    }>(`/api/events/${id}/conversations`, params),

  listLinkableConversations: (id: string) =>
    api.get<{
      conversations: Conversation[];
    }>(`/api/events/${id}/linkable-conversations`),

  create: (data: CreateEventData) => api.post<Event>("/api/events", data),

  update: (id: string, data: Partial<CreateEventData>) =>
    api.put<Event>(`/api/events/${id}`, data),

  delete: (id: string) => api.delete(`/api/events/${id}`),
};

// Reminders
export const remindersApi = {
  list: (params?: {
    cursor?: string;
    search?: string;
    status?: ReminderStatus;
    dueBefore?: string;
    dueAfter?: string;
    contactId?: string;
    limit?: number;
  }) =>
    api.get<{
      reminders: Reminder[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/reminders", params),

  get: (id: string) => api.get<Reminder>(`/api/reminders/${id}`),

  create: (data: CreateReminderData) =>
    api.post<Reminder>("/api/reminders", data),

  update: (id: string, data: Partial<CreateReminderData>) =>
    api.put<Reminder>(`/api/reminders/${id}`, data),

  delete: (id: string) => api.delete(`/api/reminders/${id}`),
};

// Tags
export const tagsApi = {
  list: () => api.get<{ tags: Tag[] }>("/api/tags"),

  create: (data: { name: string; color?: string }) =>
    api.post<Tag>("/api/tags", data),

  update: (id: string, data: { name?: string; color?: string }) =>
    api.put<Tag>(`/api/tags/${id}`, data),

  delete: (id: string) => api.delete(`/api/tags/${id}`),
};

// Relationships
export const relationshipsApi = {
  list: (params?: { contactId?: string }) =>
    api.get<{ relationships: Relationship[] }>("/api/relationships", params),

  create: (data: CreateRelationshipData) =>
    api.post<Relationship>("/api/relationships", data),

  update: (id: string, data: { typeId?: string; notes?: string }) =>
    api.put<Relationship>(`/api/relationships/${id}`, data),

  delete: (id: string) => api.delete<{ success: true }>(`/api/relationships/${id}`),
};

// Relationship Types
export const relationshipTypesApi = {
  list: () => api.get<{ types: RelationshipType[] }>("/api/relationships/types"),

  create: (data: CreateRelationshipTypeData) =>
    api.post<RelationshipType>("/api/relationships/types", data),

  update: (id: string, data: Partial<CreateRelationshipTypeData>) =>
    api.put<RelationshipType>(`/api/relationships/types/${id}`, data),

  delete: (id: string) =>
    api.delete<{ success: true }>(`/api/relationships/types/${id}`),

  seed: () =>
    api.post<{ seeded: number; existing: number }>("/api/relationships/types/seed"),
};

// User / GDPR
export const userApi = {
  getConsent: () =>
    api.get<{ aiConsent: boolean; sttConsent: boolean }>("/api/users/me/consent"),

  updateConsent: (data: { aiConsent?: boolean; sttConsent?: boolean }) =>
    api.put<{ success: true }>("/api/users/me/consent", data),

  exportData: () => api.get<Record<string, unknown>>("/api/users/me/export"),

  deleteAccount: () => api.delete<{ success: true }>("/api/users/me"),
};

// Assistant
export type AssistantContactCard = {
  id: string;
  displayName: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
};

export type AssistantConversationCard = {
  id: string;
  medium: string;
  happenedAt: string;
  content?: string | null;
  participants?: string[];
};

export type AssistantEventCard = {
  id: string;
  title: string;
  startAt: string;
  location?: string | null;
  participants?: string[];
};

export type AssistantReminderCard = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  participants?: string[];
};

export type AssistantCreatedCard =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "conversation"; conversation: AssistantConversationCard }
  | { kind: "event"; event: AssistantEventCard }
  | { kind: "reminder"; reminder: AssistantReminderCard };

export type AssistantSelectionOption = {
  id: string;
  entityKind: "contact" | "conversation" | "event" | "reminder" | "relationship_type";
  title: string;
  subtitle?: string | null;
  selectMessage: string;
};

export type AssistantUi =
  | { kind: "contact"; contact: AssistantContactCard }
  | { kind: "contacts"; count: number; contacts: AssistantContactCard[] }
  | { kind: "conversations"; count: number; conversations: AssistantConversationCard[] }
  | { kind: "events"; count: number; events: AssistantEventCard[] }
  | { kind: "reminders"; count: number; reminders: AssistantReminderCard[] }
  | { kind: "created"; cards: AssistantCreatedCard[] }
  | { kind: "selection"; prompt: string; options: AssistantSelectionOption[] }
  | { kind: "confirmation"; action: string; entityType?: string; details?: Record<string, unknown> };

export type AssistantAction = {
  label: string;
  message: string;
  style: "primary" | "secondary";
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ui?: AssistantUi | null;
  actions?: AssistantAction[];
};

export type ChatResponse = ChatMessage & {
  conversationId: string;
  actions?: AssistantAction[];
};

export type AssistantConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  lastMessage: { content: string; role: "user" | "assistant" } | null;
};

export type AssistantConversationDetail = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    ui: AssistantUi | null;
    thumbsUp?: boolean;
    thumbsDown?: boolean;
    createdAt: string;
  }>;
};

export const assistantApi = {
  chat: (messages: ChatMessage[], conversationId?: string, onStatus?: (message: string) => void) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (onStatus) {
      return api.streamPost<ChatResponse>("/api/assistant", { messages, conversationId, timezone }, onStatus);
    }
    return api.post<ChatResponse>("/api/assistant", { messages, conversationId, timezone });
  },

  listConversations: (cursor?: string) =>
    api.get<{
      conversations: AssistantConversationSummary[];
      nextCursor: string | null;
    }>("/api/assistant/conversations", cursor ? { cursor } : undefined),

  getConversation: (id: string) =>
    api.get<AssistantConversationDetail>(`/api/assistant/conversations/${id}`),

  deleteConversation: (id: string) =>
    api.delete<{ success: boolean }>(`/api/assistant/conversations/${id}`),

  updateConversationTitle: (id: string, title: string) =>
    api.patch<{ id: string; title: string; updatedAt: string }>(
      `/api/assistant/conversations/${id}`,
      { title }
    ),

  feedbackMessage: (messageId: string, feedback: { thumbsUp?: boolean; thumbsDown?: boolean }) =>
    api.patch<{ success: boolean }>(`/api/assistant/messages/${messageId}/feedback`, feedback),
};

export const speechApi = {
  /**
   * Send a recorded audio file to the backend for transcription via Sarvam AI.
   * @param uri - Local file URI of the recorded audio (from expo-av).
   * @returns The transcribed text.
   */
  transcribe: async (uri: string): Promise<string> => {
    console.log("[speechApi] transcribe called with uri:", uri);

    const { data: { session } } = await supabase.auth.getSession();
    console.log("[speechApi] auth session exists:", !!session?.access_token);

    const formData = new FormData();
    const normalizedUri = uri.split("?")[0];
    const extensionMatch = normalizedUri.match(/\.([a-zA-Z0-9]+)$/);
    const extension = (extensionMatch?.[1] || "aac").toLowerCase();
    const fileName = `recording.${extension}`;
    const mimeType =
      extension === "webm"
        ? "audio/webm"
        : extension === "m4a" || extension === "mp4"
          ? "audio/mp4"
          : extension === "aac"
            ? "audio/aac"
            : "application/octet-stream";

    if (Platform.OS === "web") {
      // On web, expo-av returns a blob: URL -- fetch it and append as a File
      console.log("[speechApi] Web platform: fetching blob from URI...");
      const blobResponse = await fetch(uri);
      const blob = await blobResponse.blob();
      console.log("[speechApi] Blob size:", blob.size, "type:", blob.type);
      const file = new File([blob], fileName, {
        type: blob.type || mimeType,
      });
      formData.append("audio", file);
    } else {
      console.log("[speechApi] Native upload metadata:", {
        name: fileName,
        type: mimeType,
      });
      try {
        const localProbe = await fetch(uri);
        const localBlob = await localProbe.blob();
        console.log("[speechApi] Native local blob probe:", {
          size: localBlob.size,
          type: localBlob.type,
        });
      } catch (probeError) {
        console.warn("[speechApi] Native local blob probe failed:", probeError);
      }
      // React Native FormData accepts { uri, name, type } objects for file uploads
      formData.append(
        "audio",
        {
          uri,
          name: fileName,
          type: mimeType,
        } as any
      );
    }

    const baseUrl = API_URL || "";
    const url = baseUrl ? `${baseUrl}/api/speech/transcribe` : "/api/speech/transcribe";
    console.log("[speechApi] Sending POST to:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
        // Let fetch set Content-Type with boundary for multipart/form-data
      },
      body: formData,
    });

    console.log("[speechApi] Response status:", response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("[speechApi] Error response:", error);
      throw new Error(error.error || `Transcription failed (${response.status})`);
    }

    const result = await response.json();
    console.log("[speechApi] Result:", result);
    return result.transcript || "";
  },
};

// ============================================
// Types
// ============================================

export type Contact = {
  id: string;
  displayName: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  images?: ContactImage[];
};

export type ContactPhoneSearchResponse = {
  contact: Contact | null;
  candidates: Contact[];
  conversations?: Conversation[];
  events?: Event[];
  reminders?: Reminder[];
};

export type CreateContactData = {
  displayName: string;
  primaryPhone?: string;
  primaryEmail?: string;
  dateOfBirth?: string;
  gender?: "MALE" | "FEMALE";
  company?: string;
  jobTitle?: string;
  location?: string;
  notes?: string;
  tagIds?: string[];
};

export type GoogleImportContact = {
  displayName?: string;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  dateOfBirth?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  photoBase64?: string | null;
  photoContentType?: string | null;
};

export type GoogleImportBatchResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

export type ContactImage = {
  id: string;
  imageUrl: string;
  order: number;
};

export type ConversationMedium =
  | "PHONE_CALL"
  | "WHATSAPP"
  | "EMAIL"
  | "CHANCE_ENCOUNTER"
  | "ONLINE_MEETING"
  | "IN_PERSON_MEETING"
  | "OTHER";

export type Conversation = {
  id: string;
  content?: string | null;
  medium: ConversationMedium;
  happenedAt: string;
  followUpAt?: string | null;
  eventId?: string | null;
  createdAt: string;
  updatedAt: string;
  participants?: { contact: Contact }[];
  event?: { id: string; title: string } | null;
};

export type CreateConversationData = {
  content?: string;
  medium: ConversationMedium;
  happenedAt: string;
  followUpAt?: string;
  eventId?: string;
  participantIds: string[];
};

export type EventType =
  | "MEETING"
  | "CALL"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "CONFERENCE"
  | "SOCIAL"
  | "FAMILY_EVENT"
  | "JOURNAL"
  | "OTHER";

export type Event = {
  id: string;
  title: string;
  description?: string | null;
  eventType: EventType;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  createdAt: string;
  updatedAt: string;
  participants?: { contact: Contact }[];
  conversations?: Conversation[];
  _count?: { conversations: number };
};

export type CreateEventData = {
  title: string;
  description?: string;
  eventType: EventType;
  startAt: string;
  endAt?: string;
  location?: string;
  participantIds?: string[];
};

export type ReminderStatus = "OPEN" | "DONE" | "CANCELED";
export type ReminderRecurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Reminder = {
  id: string;
  title: string;
  notes?: string | null;
  dueAt: string;
  status: ReminderStatus;
  recurrence: ReminderRecurrence;
  recurrenceInterval: number;
  recurrenceEndsAt?: string | null;
  conversationId?: string | null;
  isAutoFromConversation: boolean;
  createdAt: string;
  updatedAt: string;
  participants?: { contact: Contact }[];
  conversation?: {
    id: string;
    medium: ConversationMedium;
    happenedAt: string;
  } | null;
};

export type CreateReminderData = {
  title?: string;
  notes?: string;
  dueAt: string;
  status?: ReminderStatus;
  recurrence?: ReminderRecurrence;
  recurrenceInterval?: number;
  recurrenceEndsAt?: string | null;
  conversationId?: string;
  participantIds?: string[];
};

// Relationships
export type RelationshipType = {
  id: string;
  name: string;
  reverseTypeId?: string | null;
  maleReverseTypeId?: string | null;
  femaleReverseTypeId?: string | null;
  isSymmetric: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Relationship = {
  id: string;
  fromContactId: string;
  toContactId: string;
  typeId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  fromContact?: { id: string; displayName: string } | null;
  toContact?: { id: string; displayName: string } | null;
  type?: RelationshipType | null;
};

export type CreateRelationshipData = {
  fromContactId: string;
  toContactId: string;
  typeId: string;
  notes?: string;
};

export type CreateRelationshipTypeData = {
  name: string;
  reverseTypeId?: string;
  maleReverseTypeId?: string;
  femaleReverseTypeId?: string;
  isSymmetric?: boolean;
};
