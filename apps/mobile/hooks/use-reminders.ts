import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  remindersApi,
  type CreateReminderData,
  type ReminderStatus,
} from "../lib/api";
import { reminderKeys } from "../lib/query-keys";

export function useReminders({
  search,
  status,
  contactId,
}: { search?: string; status?: ReminderStatus; contactId?: string } = {}) {
  return useInfiniteQuery({
    queryKey: reminderKeys.list({ search, status, contactId }),
    queryFn: ({ pageParam }) =>
      remindersApi.list({
        search: search || undefined,
        status,
        contactId: contactId || undefined,
        cursor: pageParam || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 1, // 1 min (time-sensitive)
  });
}

export function useReminder(id: string) {
  return useQuery({
    queryKey: reminderKeys.detail(id),
    queryFn: () => remindersApi.get(id),
    staleTime: 1000 * 60 * 1,
    enabled: !!id,
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReminderData) => remindersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateReminderData>;
    }) => remindersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => remindersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}
