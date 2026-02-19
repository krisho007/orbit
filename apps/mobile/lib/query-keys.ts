import type { ReminderStatus } from "./api";

export const contactKeys = {
  all: ["contacts"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (filters: { search?: string }) =>
    [...contactKeys.lists(), filters] as const,
  details: () => [...contactKeys.all, "detail"] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
};

export const conversationKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationKeys.all, "list"] as const,
  list: (filters: { search?: string; medium?: string }) =>
    [...conversationKeys.lists(), filters] as const,
  byContact: (contactId: string) =>
    [...conversationKeys.all, "byContact", contactId] as const,
  details: () => [...conversationKeys.all, "detail"] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
};

export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  list: (filters: { search?: string; eventType?: string }) =>
    [...eventKeys.lists(), filters] as const,
  details: () => [...eventKeys.all, "detail"] as const,
  detail: (id: string) => [...eventKeys.details(), id] as const,
};

export const reminderKeys = {
  all: ["reminders"] as const,
  lists: () => [...reminderKeys.all, "list"] as const,
  list: (filters: { search?: string; status?: ReminderStatus; contactId?: string }) =>
    [...reminderKeys.lists(), filters] as const,
  details: () => [...reminderKeys.all, "detail"] as const,
  detail: (id: string) => [...reminderKeys.details(), id] as const,
};

export const relationshipKeys = {
  all: ["relationships"] as const,
  byContact: (contactId: string) =>
    [...relationshipKeys.all, "byContact", contactId] as const,
};

export const tagKeys = {
  all: ["tags"] as const,
};
