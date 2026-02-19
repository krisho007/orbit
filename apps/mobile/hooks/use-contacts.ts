import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { contactsApi, type Contact, type CreateContactData } from "../lib/api";
import { contactKeys, conversationKeys, reminderKeys } from "../lib/query-keys";

export function useContacts({ search }: { search?: string } = {}) {
  return useInfiniteQuery({
    queryKey: contactKeys.list({ search }),
    queryFn: ({ pageParam }) =>
      contactsApi.list({
        search: search || undefined,
        cursor: pageParam || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2, // 2 min
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.get(id),
    staleTime: 1000 * 60 * 5, // 5 min
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      image,
    }: {
      data: CreateContactData;
      image?: { base64Data: string; contentType: string; fileName?: string };
    }) => {
      const contact = await contactsApi.create(data);
      if (image) {
        await contactsApi.uploadImage(contact.id, image);
      }
      return contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
      imageAction,
    }: {
      id: string;
      data: Partial<CreateContactData>;
      imageAction?: {
        deleteImageId?: string;
        upload?: { base64Data: string; contentType: string; fileName?: string };
      };
    }) => {
      const contact = await contactsApi.update(id, data);
      if (imageAction?.deleteImageId) {
        await contactsApi.deleteImage(id, imageAction.deleteImageId);
      }
      if (imageAction?.upload) {
        await contactsApi.uploadImage(id, imageAction.upload);
      }
      return contact;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: contactKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: contactKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
      queryClient.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}
