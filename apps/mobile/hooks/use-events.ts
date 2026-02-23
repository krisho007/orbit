import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { eventsApi, type CreateEventData } from "../lib/api";
import { eventKeys } from "../lib/query-keys";

export function useEvents({
  search,
  eventType,
}: { search?: string; eventType?: string } = {}) {
  return useInfiniteQuery({
    queryKey: eventKeys.list({ search, eventType }),
    queryFn: ({ pageParam }) =>
      eventsApi.list({
        search: search || undefined,
        eventType: eventType || undefined,
        cursor: pageParam || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => eventsApi.get(id),
    staleTime: 1000 * 60 * 5,
    enabled: !!id,
  });
}

export function useUpcomingEvents(limit = 7) {
  return useQuery({
    queryKey: eventKeys.upcoming(),
    queryFn: () => eventsApi.list({ upcoming: true, limit }),
    select: (data) => data.events,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEventData) => eventsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateEventData> }) =>
      eventsApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: eventKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eventsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
