import { supabase } from "./supabase";

// In production (fly.io), API and Web are same origin, so use empty string
// In development, point to local API server
const API_URL = process.env.EXPO_PUBLIC_API_URL || 
  (typeof window !== "undefined" && window.location?.hostname !== "localhost" 
    ? "" // Same origin in production
    : "http://localhost:3001");

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
    const url = new URL(path, this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
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

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
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

  delete: (id: string) => api.delete(`/api/contacts/${id}`),
};

// Conversations
export const conversationsApi = {
  list: (params?: {
    cursor?: string;
    search?: string;
    medium?: string;
    limit?: number;
  }) =>
    api.get<{
      conversations: Conversation[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/conversations", params),

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
    limit?: number;
  }) =>
    api.get<{
      events: Event[];
      nextCursor: string | null;
      stats?: { totalCount: number };
    }>("/api/events", params),

  get: (id: string) => api.get<Event>(`/api/events/${id}`),

  create: (data: CreateEventData) => api.post<Event>("/api/events", data),

  update: (id: string, data: Partial<CreateEventData>) =>
    api.put<Event>(`/api/events/${id}`, data),

  delete: (id: string) => api.delete(`/api/events/${id}`),
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

// Assistant
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const assistantApi = {
  chat: (messages: ChatMessage[]) =>
    api.post<ChatMessage>("/api/assistant", { messages }),
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
