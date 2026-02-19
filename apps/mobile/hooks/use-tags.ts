import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "../lib/api";
import { tagKeys } from "../lib/query-keys";

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: () => tagsApi.list(),
    select: (data) => data.tags,
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}
