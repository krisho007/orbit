import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  relationshipsApi,
  relationshipTypesApi,
  type CreateRelationshipData,
} from "../lib/api";
import { relationshipKeys } from "../lib/query-keys";

export function useRelationshipsByContact(contactId: string) {
  return useQuery({
    queryKey: relationshipKeys.byContact(contactId),
    queryFn: () => relationshipsApi.list({ contactId }),
    select: (data) => data.relationships,
    staleTime: 1000 * 60 * 10, // 10 min
    enabled: !!contactId,
  });
}

export function useRelationshipTypes() {
  return useQuery({
    queryKey: ["relationshipTypes"] as const,
    queryFn: async () => {
      let data = await relationshipTypesApi.list();
      if (data.types.length === 0) {
        await relationshipTypesApi.seed();
        data = await relationshipTypesApi.list();
      }
      return data.types;
    },
    staleTime: 1000 * 60 * 30, // 30 min
  });
}

export function useCreateRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRelationshipData) =>
      relationshipsApi.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: relationshipKeys.byContact(variables.fromContactId),
      });
      queryClient.invalidateQueries({
        queryKey: relationshipKeys.byContact(variables.toContactId),
      });
    },
  });
}

export function useDeleteRelationship() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      fromContactId,
      toContactId,
    }: {
      id: string;
      fromContactId: string;
      toContactId: string;
    }) => relationshipsApi.delete(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: relationshipKeys.byContact(variables.fromContactId),
      });
      queryClient.invalidateQueries({
        queryKey: relationshipKeys.byContact(variables.toContactId),
      });
    },
  });
}
