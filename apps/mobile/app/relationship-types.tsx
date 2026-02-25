import { useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Lock,
  Trash2,
  Plus,
  ArrowLeftRight,
} from "lucide-react-native";
import { RelationshipType, relationshipTypesApi } from "../lib/api";
import { getThemeColor, useThemeColors } from "../lib/theme";
import { useConfirmDialog } from "../components/confirm-dialog";

export default function RelationshipTypesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const placeholderColor = getThemeColor(colors, "typography-500");
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // New type form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newReverseName, setNewReverseName] = useState("");
  const [newSymmetric, setNewSymmetric] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setIsLoading(true);
      const data = await relationshipTypesApi.list();
      setTypes(data.types);
    } catch (error) {
      console.error("Failed to load relationship types:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      setIsSeeding(true);
      const result = await relationshipTypesApi.seed();
      if (result.seeded > 0) {
        await loadTypes();
      }
    } catch (error) {
      console.error("Failed to seed types:", error);
      Alert.alert("Error", "Failed to seed default types");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "Type name is required");
      return;
    }

    try {
      setIsCreating(true);

      if (newSymmetric) {
        const created = await relationshipTypesApi.create({
          name: newName.trim(),
          isSymmetric: true,
        });
        await relationshipTypesApi.update(created.id, { reverseTypeId: created.id });
      } else {
        if (!newReverseName.trim()) {
          Alert.alert("Error", "Reverse type name is required for non-symmetric types");
          setIsCreating(false);
          return;
        }
        const forward = await relationshipTypesApi.create({
          name: newName.trim(),
        });
        const reverse = await relationshipTypesApi.create({
          name: newReverseName.trim(),
          reverseTypeId: forward.id,
        });
        await relationshipTypesApi.update(forward.id, {
          reverseTypeId: reverse.id,
        });
      }

      setShowNewForm(false);
      setNewName("");
      setNewReverseName("");
      setNewSymmetric(false);
      await loadTypes();
    } catch (error) {
      console.error("Failed to create type:", error);
      Alert.alert("Error", "Failed to create relationship type");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (type: RelationshipType) => {
    const confirmed = await confirm({
      title: "Delete Type",
      message: `Delete "${type.name}"? Relationships using this type will also be deleted.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await relationshipTypesApi.delete(type.id);
      await loadTypes();
    } catch (error) {
      console.error("Failed to delete type:", error);
      Alert.alert("Error", "Failed to delete relationship type");
    }
  };

  const systemTypes = types.filter((t) => t.isSystem);
  const customTypes = types.filter((t) => !t.isSystem);
  const hasSystemTypes = systemTypes.length > 0;

  // Build a name lookup for reverse type display
  const typeNameMap = new Map(types.map((t) => [t.id, t.name]));

  const getReverseName = (type: RelationshipType): string | null => {
    if (type.isSymmetric) return null; // symmetric = same in both directions
    if (type.reverseTypeId) return typeNameMap.get(type.reverseTypeId) || null;
    return null;
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-200">
        <Pressable onPress={() => router.back()} className="p-2">
          <ChevronLeft size={22} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
        <Text className="text-lg font-body-semibold text-typography-900">
          Relationship Types
        </Text>
        <View className="w-10" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 py-4">
          {/* Seed button (only if no system types) */}
          {!hasSystemTypes && (
            <Pressable
              onPress={handleSeed}
              disabled={isSeeding}
              className="mb-4 py-3 px-4 rounded-lg bg-primary-600 active:bg-primary-700"
            >
              <Text className="text-white text-center text-base font-body-medium">
                {isSeeding ? "Seeding..." : "Seed Default Types"}
              </Text>
            </Pressable>
          )}

          {/* System Types */}
          {systemTypes.length > 0 && (
            <View className="mb-6">
              <Text className="text-typography-500 text-sm font-body-medium mb-3 uppercase">
                System Types
              </Text>
              {systemTypes.map((type) => {
                const reverseName = getReverseName(type);
                return (
                  <View
                    key={type.id}
                    className="flex-row items-center p-4 mb-2 bg-background-50 rounded-xl border border-border-200"
                  >
                    <Lock
                      size={14}
                      color={getThemeColor(colors, "typography-400")}
                    />
                    <View className="flex-1 ml-3">
                      <View className="flex-row items-center">
                        <Text className="text-typography-900 text-base">
                          {type.name}
                        </Text>
                        {reverseName && (
                          <>
                            <ArrowLeftRight
                              size={12}
                              color={getThemeColor(colors, "typography-400")}
                              style={{ marginHorizontal: 6 }}
                            />
                            <Text className="text-typography-600 text-base">
                              {reverseName}
                            </Text>
                          </>
                        )}
                      </View>
                      {type.isSymmetric && (
                        <Text className="text-typography-400 text-xs mt-1">
                          Symmetric
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Custom Types */}
          <View className="mb-6">
            <Text className="text-typography-500 text-sm font-body-medium mb-3 uppercase">
              Custom Types
            </Text>
            {customTypes.length === 0 && !showNewForm && (
              <View className="py-6 px-4 bg-background-50 rounded-xl mb-3">
                <Text className="text-typography-600 text-sm">
                  No custom types yet. Create one below.
                </Text>
              </View>
            )}

            {customTypes.map((type) => {
              const reverseName = getReverseName(type);
              return (
                <View
                  key={type.id}
                  className="flex-row items-center p-4 mb-2 bg-background-50 rounded-xl border border-border-200"
                >
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className="text-typography-900 text-base">
                        {type.name}
                      </Text>
                      {reverseName && (
                        <>
                          <ArrowLeftRight
                            size={12}
                            color={getThemeColor(colors, "typography-400")}
                            style={{ marginHorizontal: 6 }}
                          />
                          <Text className="text-typography-600 text-base">
                            {reverseName}
                          </Text>
                        </>
                      )}
                    </View>
                    {type.isSymmetric && (
                      <Text className="text-typography-400 text-xs mt-1">
                        Symmetric
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleDelete(type)}
                    className="p-2 active:opacity-50"
                  >
                    <Trash2
                      size={16}
                      color={getThemeColor(colors, "error-500")}
                    />
                  </Pressable>
                </View>
              );
            })}

            {/* Add New Type */}
            {!showNewForm ? (
              <Pressable
                onPress={() => setShowNewForm(true)}
                className="flex-row items-center py-3"
              >
                <Plus
                  size={18}
                  color={getThemeColor(colors, "primary-600")}
                />
                <Text className="text-primary-600 text-sm font-body-medium ml-2">
                  Add New Type
                </Text>
              </Pressable>
            ) : (
              <View className="p-4 border border-border-200 rounded-xl bg-background-50">
                <TextInput
                  className="px-4 py-3 bg-background-0 rounded-lg text-typography-900 text-base border border-border-200 mb-3"
                  placeholder="Type name"
                  placeholderTextColor={placeholderColor}
                  value={newName}
                  onChangeText={setNewName}
                />

                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-typography-700 text-sm">Symmetric</Text>
                  <Switch
                    value={newSymmetric}
                    onValueChange={setNewSymmetric}
                    trackColor={{
                      false: getThemeColor(colors, "border-300"),
                      true: getThemeColor(colors, "primary-500"),
                    }}
                  />
                </View>

                {!newSymmetric && (
                  <TextInput
                    className="px-4 py-3 bg-background-0 rounded-lg text-typography-900 text-base border border-border-200 mb-3"
                    placeholder="Reverse type name"
                    placeholderTextColor={placeholderColor}
                    value={newReverseName}
                    onChangeText={setNewReverseName}
                  />
                )}

                <View className="flex-row">
                  <Pressable
                    onPress={() => {
                      setShowNewForm(false);
                      setNewName("");
                      setNewReverseName("");
                      setNewSymmetric(false);
                    }}
                    className="flex-1 mr-2 py-2.5 rounded-lg bg-background-100"
                  >
                    <Text className="text-typography-700 text-center text-sm">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreate}
                    disabled={isCreating}
                    className="flex-1 py-2.5 rounded-lg bg-primary-600"
                  >
                    <Text className="text-white text-center text-sm font-body-medium">
                      {isCreating ? "Creating..." : "Create"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <View className="h-8" />
        </ScrollView>
      )}

      {ConfirmDialogElement}
    </SafeAreaView>
  );
}
