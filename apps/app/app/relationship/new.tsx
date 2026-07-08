import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Contact,
  RelationshipType,
  contactsApi,
  relationshipTypesApi,
} from "../../lib/api";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useCreateRelationship, useRelationshipTypes } from "../../hooks/use-relationships";

export default function NewRelationshipScreen() {
  const router = useRouter();
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");

  const queryClient = useQueryClient();
  const createRelationship = useCreateRelationship();
  const { data: types = [], isLoading: isLoadingTypes } = useRelationshipTypes();

  // From contact (pre-filled)
  const [fromContact, setFromContact] = useState<Contact | null>(null);

  // To contact search
  const [toContact, setToContact] = useState<Contact | null>(null);
  const [toSearch, setToSearch] = useState("");
  const [isSearchingTo, setIsSearchingTo] = useState(false);
  const [toResults, setToResults] = useState<Contact[]>([]);

  const [selectedType, setSelectedType] = useState<RelationshipType | null>(null);
  const [typeSearch, setTypeSearch] = useState("");

  // New type inline form
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeReverseName, setNewTypeReverseName] = useState("");
  const [newTypeSymmetric, setNewTypeSymmetric] = useState(false);
  const [isCreatingType, setIsCreatingType] = useState(false);

  // Notes
  const [notes, setNotes] = useState("");

  // Load from contact
  useEffect(() => {
    if (!contactId) return;
    contactsApi
      .get(contactId)
      .then(setFromContact)
      .catch((err) => console.error("Failed to load from contact:", err));
  }, [contactId]);

  // To contact search
  useEffect(() => {
    if (toSearch.trim().length < 2) {
      setToResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setIsSearchingTo(true);
        const data = await contactsApi.list({ search: toSearch.trim(), limit: 10 });
        setToResults(data.contacts);
      } catch (error) {
        console.error("Failed to search contacts:", error);
      } finally {
        setIsSearchingTo(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [toSearch]);

  const handleCreateType = async () => {
    if (!newTypeName.trim()) {
      Alert.alert("Error", "Type name is required");
      return;
    }

    try {
      setIsCreatingType(true);

      if (newTypeSymmetric) {
        const created = await relationshipTypesApi.create({
          name: newTypeName.trim(),
          isSymmetric: true,
        });
        // Link symmetric type to itself
        await relationshipTypesApi.update(created.id, { reverseTypeId: created.id });
        setSelectedType({ ...created, reverseTypeId: created.id });
      } else {
        if (!newTypeReverseName.trim()) {
          Alert.alert("Error", "Reverse type name is required for non-symmetric types");
          setIsCreatingType(false);
          return;
        }
        // Create forward type
        const forward = await relationshipTypesApi.create({
          name: newTypeName.trim(),
        });
        // Create reverse type
        const reverse = await relationshipTypesApi.create({
          name: newTypeReverseName.trim(),
          reverseTypeId: forward.id,
        });
        // Link forward to reverse
        await relationshipTypesApi.update(forward.id, { reverseTypeId: reverse.id });
        setSelectedType({ ...forward, reverseTypeId: reverse.id });
      }

      setShowNewTypeForm(false);
      setNewTypeName("");
      setNewTypeReverseName("");
      setNewTypeSymmetric(false);
      await queryClient.invalidateQueries({ queryKey: ["relationshipTypes"] });
    } catch (error) {
      console.error("Failed to create type:", error);
      Alert.alert("Error", "Failed to create relationship type");
    } finally {
      setIsCreatingType(false);
    }
  };

  const handleSubmit = async () => {
    if (!fromContact) {
      Alert.alert("Error", "From contact is required");
      return;
    }
    if (!toContact) {
      Alert.alert("Error", "To contact is required");
      return;
    }
    if (!selectedType) {
      Alert.alert("Error", "Relationship type is required");
      return;
    }

    try {
      // Create forward relationship
      await createRelationship.mutateAsync({
        fromContactId: fromContact.id,
        toContactId: toContact.id,
        typeId: selectedType.id,
        notes: notes.trim() || undefined,
      });

      // Auto-create reverse relationship
      const reverseTypeId = getReverseTypeId(selectedType, toContact);
      if (reverseTypeId) {
        try {
          await createRelationship.mutateAsync({
            fromContactId: toContact.id,
            toContactId: fromContact.id,
            typeId: reverseTypeId,
          });
        } catch {
          // Silently handle "already exists" errors
        }
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/contact/${fromContact.id}` as any);
      }
    } catch (error: any) {
      console.error("Failed to create relationship:", error);
      Alert.alert("Error", error.message || "Failed to create relationship");
    }
  };

  const getReverseTypeId = (type: RelationshipType, targetContact: Contact): string | null => {
    // If symmetric, reverse type is the same
    if (type.isSymmetric && type.reverseTypeId) return type.reverseTypeId;

    // Gender-aware reverse
    if (targetContact.gender === "MALE" && type.maleReverseTypeId) {
      return type.maleReverseTypeId;
    }
    if (targetContact.gender === "FEMALE" && type.femaleReverseTypeId) {
      return type.femaleReverseTypeId;
    }

    // Fallback to default reverse
    return type.reverseTypeId || null;
  };

  const filteredTypes = typeSearch.trim()
    ? types.filter((t) =>
        t.name.toLowerCase().includes(typeSearch.trim().toLowerCase())
      )
    : types;

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-primary-600 text-base">Cancel</Text>
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">
          New Relationship
        </Text>
        <Pressable onPress={handleSubmit} disabled={createRelationship.isPending} className="p-2">
          <Text
            className={`text-base ${
              createRelationship.isPending ? "text-typography-400" : "text-primary-600"
            }`}
          >
            {createRelationship.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 py-6" keyboardShouldPersistTaps="handled">
        {/* From Contact */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">
            From Contact
          </Text>
          {fromContact ? (
            <View className="px-4 py-3 bg-primary-50 rounded-lg border border-primary-200">
              <Text className="text-primary-700 text-base font-body-medium">
                {fromContact.displayName}
              </Text>
            </View>
          ) : (
            <View className="px-4 py-3 bg-background-50 rounded-lg border border-border-200">
              <Text className="text-typography-500 text-base">
                No contact selected
              </Text>
            </View>
          )}
        </View>

        {/* Relationship Type */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">
            Relationship Type *
          </Text>

          {selectedType ? (
            <Pressable
              onPress={() => setSelectedType(null)}
              className="px-4 py-3 bg-primary-50 rounded-lg border border-primary-200"
            >
              <Text className="text-primary-700 text-base font-body-medium">
                {selectedType.name}
              </Text>
              <Text className="text-primary-500 text-xs mt-1">Tap to change</Text>
            </Pressable>
          ) : (
            <>
              {isLoadingTypes ? (
                <View className="py-4 items-center">
                  <ActivityIndicator
                    size="small"
                    color={getThemeColor(colors, "primary-600")}
                  />
                </View>
              ) : (
                <>
                  <TextInput
                    className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200 mb-2"
                    placeholder="Search types..."
                    placeholderTextColor={placeholderColor}
                    value={typeSearch}
                    onChangeText={setTypeSearch}
                  />

                  <View className="max-h-48 border border-border-200 rounded-lg bg-background-50 mb-2">
                    <ScrollView nestedScrollEnabled>
                      {filteredTypes.map((type, index) => (
                        <Pressable
                          key={type.id}
                          onPress={() => {
                            setSelectedType(type);
                            setTypeSearch("");
                          }}
                          className={`px-4 py-3 ${
                            index < filteredTypes.length - 1
                              ? "border-b border-border-100"
                              : ""
                          }`}
                        >
                          <Text className="text-typography-900 text-base">
                            {type.name}
                          </Text>
                          {type.isSymmetric && (
                            <Text className="text-typography-500 text-xs">
                              Symmetric
                            </Text>
                          )}
                        </Pressable>
                      ))}
                      {filteredTypes.length === 0 && (
                        <View className="px-4 py-3">
                          <Text className="text-typography-500 text-sm">
                            No types found
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>

                  {/* Create new type */}
                  {!showNewTypeForm ? (
                    <Pressable
                      onPress={() => setShowNewTypeForm(true)}
                      className="py-2"
                    >
                      <Text className="text-primary-600 text-sm font-body-medium">
                        + Create new type
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="p-4 border border-border-200 rounded-lg bg-background-50">
                      <TextInput
                        className="px-4 py-3 bg-background-0 rounded-lg text-typography-900 text-base border border-border-200 mb-3"
                        placeholder="Type name (e.g. Classmate)"
                        placeholderTextColor={placeholderColor}
                        value={newTypeName}
                        onChangeText={setNewTypeName}
                      />

                      <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-typography-700 text-sm">Symmetric</Text>
                        <Switch
                          value={newTypeSymmetric}
                          onValueChange={setNewTypeSymmetric}
                          trackColor={{
                            false: getThemeColor(colors, "border-300"),
                            true: getThemeColor(colors, "primary-500"),
                          }}
                        />
                      </View>

                      {!newTypeSymmetric && (
                        <TextInput
                          className="px-4 py-3 bg-background-0 rounded-lg text-typography-900 text-base border border-border-200 mb-3"
                          placeholder="Reverse type name (e.g. Classmate)"
                          placeholderTextColor={placeholderColor}
                          value={newTypeReverseName}
                          onChangeText={setNewTypeReverseName}
                        />
                      )}

                      <View className="flex-row">
                        <Pressable
                          onPress={() => {
                            setShowNewTypeForm(false);
                            setNewTypeName("");
                            setNewTypeReverseName("");
                            setNewTypeSymmetric(false);
                          }}
                          className="flex-1 mr-2 py-2 rounded-lg bg-background-100"
                        >
                          <Text className="text-typography-700 text-center text-sm">
                            Cancel
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={handleCreateType}
                          disabled={isCreatingType}
                          className="flex-1 py-2 rounded-lg bg-primary-600"
                        >
                          <Text className="text-white text-center text-sm font-body-medium">
                            {isCreatingType ? "Creating..." : "Create"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* To Contact */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">
            To Contact *
          </Text>

          {toContact ? (
            <Pressable
              onPress={() => {
                setToContact(null);
                setToSearch("");
              }}
              className="px-4 py-3 bg-primary-50 rounded-lg border border-primary-200"
            >
              <Text className="text-primary-700 text-base font-body-medium">
                {toContact.displayName}
              </Text>
              <Text className="text-primary-500 text-xs mt-1">Tap to change</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
                placeholder="Type a contact name to search..."
                placeholderTextColor={placeholderColor}
                value={toSearch}
                onChangeText={setToSearch}
              />
              {isSearchingTo && (
                <View className="py-2">
                  <ActivityIndicator
                    size="small"
                    color={getThemeColor(colors, "primary-600")}
                  />
                </View>
              )}
              {toResults.length > 0 && (
                <View className="mt-2 border border-border-200 rounded-lg bg-background-50">
                  {toResults
                    .filter((c) => c.id !== fromContact?.id)
                    .map((contact, index, filtered) => (
                      <Pressable
                        key={contact.id}
                        onPress={() => {
                          setToContact(contact);
                          setToSearch("");
                          setToResults([]);
                        }}
                        className={`px-4 py-3 ${
                          index < filtered.length - 1
                            ? "border-b border-border-200"
                            : ""
                        }`}
                      >
                        <Text className="text-typography-900 text-base">
                          {contact.displayName}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              )}
              {toSearch.trim().length >= 2 &&
                !isSearchingTo &&
                toResults.filter((c) => c.id !== fromContact?.id).length === 0 && (
                  <Text className="text-typography-500 text-sm mt-2">
                    No contacts found.
                  </Text>
                )}
            </>
          )}
        </View>

        {/* Notes */}
        <View className="mb-4">
          <Text className="text-typography-700 text-sm font-body-medium mb-2">
            Notes (Optional)
          </Text>
          <TextInput
            className="px-4 py-3 bg-background-50 rounded-lg text-typography-900 text-base border border-border-200"
            style={{ minHeight: 80 }}
            placeholder="Any notes about this relationship..."
            placeholderTextColor={placeholderColor}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
