import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  conversationsApi,
  type CreateConversationData,
} from "../lib/api";
import { conversationKeys } from "../lib/query-keys";

export function useConversations({
  search,
  medium,
}: { search?: string; medium?: string } = {}) {
  return useInfiniteQuery({
    queryKey: conversationKeys.list({ search, medium }),
    queryFn: ({ pageParam }) =>
      conversationsApi.list({
        search: search || undefined,
        medium: medium || undefined,
        cursor: pageParam || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2, // 2 min
  });
}

export function useConversationsByContact(contactId: string) {
  return useInfiniteQuery({
    queryKey: conversationKeys.byContact(contactId),
    queryFn: ({ pageParam }) =>
      conversationsApi.listByContacts({
        contactIds: [contactId],
        cursor: pageParam || undefined,
        limit: 10,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 5, // 5 min
    enabled: !!contactId,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateConversationData) =>
      conversationsApi.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
      for (const id of variables.participantIds) {
        queryClient.invalidateQueries({
          queryKey: conversationKeys.byContact(id),
        });
      }
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateConversationData>;
    }) => conversationsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}
