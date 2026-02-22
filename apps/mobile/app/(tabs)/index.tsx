import { useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  Linking,
  Alert,
  AppState,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Search,
  X,
  Plus,
  Users,
  Download,
  Phone,
} from "lucide-react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { Contact } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getThemeColor, useThemeColors, type ThemeColors } from "../../lib/theme";
import { useContacts } from "../../hooks/use-contacts";
import { useEffect } from "react";
import { HuskyLogo } from "../../components/HuskyLogo";

function WhatsAppIcon({ size = 20, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Svg>
  );
}

function ContactsListHeader({
  search,
  onChangeSearch,
  totalCount,
  onClearSearch,
  colors,
}: {
  search: string;
  onChangeSearch: (value: string) => void;
  totalCount: number;
  onClearSearch: () => void;
  colors: ThemeColors;
}) {
  const placeholderColor = getThemeColor(colors, "typography-500");

  return (
    <View className="px-4 pt-4 pb-2 bg-background-50">
      <View className="flex-row items-center bg-background-0 rounded-2xl px-4 py-3 border border-border-200">
        <Search size={16} color={getThemeColor(colors, "typography-500")} />
        <TextInput
          className="flex-1 text-base text-typography-900 ml-2"
          placeholder="Search contacts"
          placeholderTextColor={placeholderColor}
          value={search}
          onChangeText={onChangeSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={onClearSearch} className="ml-2">
            <X size={16} color={getThemeColor(colors, "typography-500")} />
          </Pressable>
        )}
      </View>

      {!search && totalCount > 0 && (
        <Text className="text-typography-500 text-sm mt-3">
          {totalCount} contact{totalCount !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );
}

function SwipeAction({
  progress,
  trackedProgress,
  label,
  align,
  icon,
  backgroundColor,
  textColor,
}: {
  progress: SharedValue<number>;
  trackedProgress: SharedValue<number>;
  label: string;
  align: "left" | "right";
  icon: ReactNode;
  backgroundColor: string;
  textColor: string;
}) {
  useAnimatedReaction(
    () => progress.value,
    (value) => {
      trackedProgress.value = value;
    }
  );

  const slideFrom = align === "left" ? -20 : 20;
  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.2, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [slideFrom, 0], Extrapolation.CLAMP),
      },
      { scale: interpolate(progress.value, [0, 1], [0.92, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View
      style={[actionStyle, { backgroundColor }]}
      className={`mx-4 mb-3 rounded-xl flex-1 px-6 justify-center ${align === "left" ? "items-start" : "items-end"}`}
    >
      {icon}
      <Text className="text-xs font-body-semibold mt-1" style={{ color: textColor }}>
        {label}
      </Text>
    </Animated.View>
  );
}

function ContactRow({
  item,
  colors,
  swipeableRef,
  onOpenContact,
  onOpenCall,
  onOpenWhatsApp,
  onWillOpenRow,
}: {
  item: Contact;
  colors: ThemeColors;
  swipeableRef: { current: SwipeableMethods | null };
  onOpenContact: (id: string) => void;
  onOpenCall: (phone: string) => void;
  onOpenWhatsApp: (phone: string) => void;
  onWillOpenRow: (id: string) => void;
}) {
  const leftSwipeProgress = useSharedValue(0);
  const rightSwipeProgress = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => {
    const swipeAmount = Math.max(leftSwipeProgress.value, rightSwipeProgress.value);
    return {
      opacity: interpolate(swipeAmount, [0, 1], [1, 0.7], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(swipeAmount, [0, 1], [1, 0.985], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const blurOverlayStyle = useAnimatedStyle(() => {
    const swipeAmount = Math.max(leftSwipeProgress.value, rightSwipeProgress.value);
    return {
      opacity: interpolate(swipeAmount, [0, 1], [0, 0.24], Extrapolation.CLAMP),
    };
  });

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={Boolean(item.primaryPhone)}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(progress) => (
        <SwipeAction
          progress={progress}
          trackedProgress={leftSwipeProgress}
          label="Call"
          align="left"
          icon={<Phone size={20} color={getThemeColor(colors, "primary-700")} />}
          backgroundColor={getThemeColor(colors, "primary-100")}
          textColor={getThemeColor(colors, "primary-700")}
        />
      )}
      renderRightActions={(progress) => (
        <SwipeAction
          progress={progress}
          trackedProgress={rightSwipeProgress}
          label="WhatsApp"
          align="right"
          icon={<WhatsAppIcon size={20} color="#25D366" />}
          backgroundColor={getThemeColor(colors, "background-100")}
          textColor={getThemeColor(colors, "typography-700")}
        />
      )}
      onSwipeableWillOpen={() => {
        onWillOpenRow(item.id);
      }}
      onSwipeableOpen={(direction) => {
        if (!item.primaryPhone) return;
        if (direction === "right") {
          onOpenCall(item.primaryPhone);
          return;
        }
        if (direction === "left") {
          onOpenWhatsApp(item.primaryPhone);
        }
      }}
    >
      <Animated.View style={cardStyle}>
        <Pressable
          onPress={() => onOpenContact(item.id)}
          className="relative overflow-hidden flex-row items-center px-4 py-3 bg-background-0 border border-border-200 rounded-xl mx-4 mb-2.5 active:bg-background-50"
        >
          {item.images?.[0]?.imageUrl ? (
            <Image
              source={{ uri: item.images[0].imageUrl }}
              className="w-11 h-11 rounded-xl mr-3.5"
            />
          ) : (
            <View className="w-11 h-11 rounded-xl bg-primary-100 items-center justify-center mr-3.5">
              <Text className="text-primary-700 text-lg font-body-semibold">
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text className="flex-1 text-typography-900 font-body-semibold text-[17px]">
            {item.displayName}
          </Text>

          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              blurOverlayStyle,
              {
                backgroundColor: getThemeColor(colors, "background-50"),
                borderRadius: 12,
              },
            ]}
          />
        </Pressable>
      </Animated.View>
    </Swipeable>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const colors = useThemeColors();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const swipeableRefs = useRef<Record<string, { current: SwipeableMethods | null }>>({});

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearch("");
    clearTimeout(debounceRef.current);
    setDebouncedSearch("");
  }, []);

  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useContacts({ search: debouncedSearch || undefined });

  const contacts = [
    ...new Map((data?.pages.flatMap((p) => p.contacts) ?? []).map((c) => [c.id, c])).values(),
  ];
  const totalCount = data?.pages[0]?.stats?.totalCount ?? 0;

  const getSwipeableRef = useCallback((id: string) => {
    if (!swipeableRefs.current[id]) {
      swipeableRefs.current[id] = { current: null };
    }
    return swipeableRefs.current[id];
  }, []);

  const closeAllSwipeables = useCallback(() => {
    Object.values(swipeableRefs.current).forEach((ref) => ref.current?.close());
  }, []);

  const closeOtherSwipeables = useCallback((openId: string) => {
    Object.entries(swipeableRefs.current).forEach(([id, ref]) => {
      if (id !== openId) {
        ref.current?.close();
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      closeAllSwipeables();
    }, [closeAllSwipeables])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        closeAllSwipeables();
      }
    });

    return () => subscription.remove();
  }, [closeAllSwipeables]);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    const cleaned = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() => {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp for this number.");
    });
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <ContactRow
      item={item}
      colors={colors}
      swipeableRef={getSwipeableRef(item.id)}
      onOpenContact={(id) =>
        router.push({
          pathname: "/contact/[id]",
          params: { id, from: "/(tabs)/index" },
        })
      }
      onOpenCall={handleCall}
      onOpenWhatsApp={handleWhatsApp}
      onWillOpenRow={closeOtherSwipeables}
    />
  );

  const ListEmpty = () => (
    <View className="flex-1 items-center justify-center py-20">
      {isLoading ? (
        <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
      ) : (
        <>
          <HuskyLogo size={48} color={getThemeColor(colors, "typography-300")} />
          <Text className="text-typography-900 text-lg font-body-semibold mb-2 mt-4">
            {search ? "No contacts found" : "No contacts yet"}
          </Text>
          <Text className="text-typography-500 text-center px-8">
            {search
              ? "Try a different search term"
              : "Add your first contact to get started"}
          </Text>
        </>
      )}
    </View>
  );

  const ListFooter = () =>
    isFetchingNextPage ? (
      <View className="py-4">
        <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
      </View>
    ) : null;

  return (
    <AnimatedTabScreen tabName="index">
    <View className="flex-1 bg-background-50">
      <ContactsListHeader
        search={search}
        onChangeSearch={handleSearchChange}
        totalCount={totalCount}
        onClearSearch={handleClearSearch}
        colors={colors}
      />
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
            tintColor={getThemeColor(colors, "primary-600")}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
      />

      <View className="absolute bottom-6 right-6 items-center">
        <Pressable
          onPress={() => router.push("/contact/new")}
          className="w-14 h-14 bg-primary-600 rounded-full items-center justify-center shadow-lg active:bg-primary-700 mb-3"
        >
          <Plus size={22} color={getThemeColor(colors, "typography-0")} />
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/google-import" as any,
              params: { entry: "contacts" },
            })
          }
          className="w-12 h-12 bg-background-0 border border-border-200 rounded-full items-center justify-center shadow-sm active:bg-background-50"
        >
          <Download size={18} color={getThemeColor(colors, "primary-600")} />
        </Pressable>
      </View>
    </View>
    </AnimatedTabScreen>
  );
}
