import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import type { ComponentType } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
  Easing,
} from "react-native";
import { useRouter, useNavigation, useFocusEffect } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import {
  useAudioRecorder,
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  RecordingOptions,
  setAudioModeAsync,
  useAudioRecorderState,
} from "expo-audio";
import {
  Sparkles,
  SendHorizonal,
  Mic,
  Phone,
  MessageCircle,
  Mail,
  Handshake,
  Monitor,
  Building2,
  FileText,
  CalendarDays,
  MapPin,
  Bell,
  SquarePen,
} from "lucide-react-native";
import {
  assistantApi,
  speechApi,
  ChatMessage,
  AssistantUi,
  AssistantContactCard,
  AssistantConversationCard,
  AssistantEventCard,
  AssistantReminderCard,
  AssistantSelectionOption,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { isAssistantCoachmarkSeen, markAssistantCoachmarkSeen } from "../../lib/onboarding";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useGluestackUI } from "../../components/ui/gluestack-ui-provider";

type Message = ChatMessage & {
  id: string;
  isLoading?: boolean;
};

type AssistantDraftState = {
  messages: Message[];
  input: string;
  messageSequence: number;
};

const assistantDraftState: AssistantDraftState = {
  messages: [],
  input: "",
  messageSequence: 0,
};

const SUGGESTIONS = [
  "Find contact Krishna",
  "Show my recent conversations",
  "What are my upcoming events?",
  "I had a call with Sarah today",
];

const CAPABILITY_TAGS = [
  "Log conversations",
  "Find contacts quickly",
  "Track reminders",
  "Review recent activity",
];

const RESULT_CARD_LIMIT = 10;
const RECORDING_AUTO_STOP_MS = 15_000;
const STT_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    audioSource: "mic",
  },
  ios: {
    extension: ".m4a",
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

const MEDIUM_META: Record<
  string,
  { label: string; icon: ComponentType<{ size?: number; color?: string }> }
> = {
  PHONE_CALL: { label: "Phone Call", icon: Phone },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  CHANCE_ENCOUNTER: { label: "Chance Encounter", icon: Handshake },
  ONLINE_MEETING: { label: "Online Meeting", icon: Monitor },
  IN_PERSON_MEETING: { label: "In-Person Meeting", icon: Building2 },
  OTHER: { label: "Other", icon: FileText },
};

const REMINDER_STATUS_META: Record<string, string> = {
  OPEN: "Open",
  DONE: "Done",
  CANCELED: "Canceled",
};

export default function AssistantScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { resolvedColorMode } = useGluestackUI();
  const scrollIndicatorStyle = resolvedColorMode === "dark" ? "white" : "black";
  const resultScrollContentStyle = Platform.OS === "android" ? { paddingRight: 6 } : undefined;
  const [messages, setMessages] = useState<Message[]>(assistantDraftState.messages);
  const [input, setInput] = useState(assistantDraftState.input);
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
  const audioRecorder = useAudioRecorder(STT_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;
  const flatListRef = useRef<FlatList>(null);
  const isSendingRef = useRef(false);
  const messageSequenceRef = useRef(assistantDraftState.messageSequence);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRecordingRef = useRef(false);
  const recordingPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: "doNotMix",
          shouldRouteThroughEarpiece: false,
        });
      } catch (err) {
        console.warn("[STT] Failed to initialize audio mode:", err);
      }
    })();
  }, []);

  useEffect(() => {
    // Keep only stable messages in cache so returning from detail pages restores results.
    assistantDraftState.messages = messages.filter((message) => !message.isLoading);
  }, [messages]);

  useEffect(() => {
    assistantDraftState.input = input;
  }, [input]);

  useEffect(
    () => () => {
      assistantDraftState.messages = assistantDraftState.messages.filter(
        (message) => !message.isLoading
      );
      assistantDraftState.messageSequence = messageSequenceRef.current;
    },
    []
  );

  useEffect(() => {
    let isCancelled = false;

    const loadCoachmarkState = async () => {
      if (!user?.id) {
        if (!isCancelled) {
          setShowCoachmark(false);
        }
        return;
      }

      try {
        const seen = await isAssistantCoachmarkSeen(user.id);
        if (!isCancelled) {
          setShowCoachmark(!seen);
        }
      } catch (error) {
        console.error("Failed to load coachmark state:", error);
      }
    };

    loadCoachmarkState();
    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  const dismissCoachmark = useCallback(async () => {
    if (!showCoachmark) {
      return;
    }

    setShowCoachmark(false);

    if (!user?.id) {
      return;
    }

    try {
      await markAssistantCoachmarkSeen(user.id);
    } catch (error) {
      console.error("Failed to mark coachmark as seen:", error);
    }
  }, [showCoachmark, user?.id]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setIsLoading(false);
    isSendingRef.current = false;
    messageSequenceRef.current = 0;
    assistantDraftState.messages = [];
    assistantDraftState.input = "";
    assistantDraftState.messageSequence = 0;
  }, []);

  const clearRecordingTimeout = useCallback(() => {
    if (!recordingTimeoutRef.current) return;
    clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
  }, []);

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (isStoppingRecordingRef.current) {
      return;
    }
    isStoppingRecordingRef.current = true;
    clearRecordingTimeout();
    setIsTranscribing(true);

    try {
      console.log("[STT] Stopping recording...");
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      console.log("[STT] Recording URI:", uri);

      if (!uri) {
        Alert.alert("Error", "No audio was captured.");
        setIsTranscribing(false);
        return;
      }

      console.log("[STT] Sending to transcription API...");
      const transcript = await speechApi.transcribe(uri);
      console.log("[STT] Transcript received:", transcript);
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      } else {
        console.warn("[STT] Empty transcript returned");
      }
    } catch (err) {
      console.error("[STT] Transcription failed:", err);
      Alert.alert("Error", "Could not transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
      isStoppingRecordingRef.current = false;
    }
  }, [audioRecorder, clearRecordingTimeout]);

  const startRecording = useCallback(async () => {
    try {
      console.log("[STT] Requesting microphone permission...");
      const currentPermission = await AudioModule.getRecordingPermissionsAsync();
      console.log("[STT] Current mic permission:", currentPermission);
      const status = await AudioModule.requestRecordingPermissionsAsync();
      console.log("[STT] Permission response:", status);
      if (!status.granted) {
        if (!status.canAskAgain) {
          Alert.alert(
            "Microphone permission blocked",
            "Enable microphone access for Orbit from your phone settings.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  Linking.openSettings().catch((err) => {
                    console.warn("[STT] Failed to open settings:", err);
                  });
                },
              },
            ]
          );
        } else {
          Alert.alert(
            "Permission needed",
            "Microphone access is required for speech-to-text."
          );
        }
        return;
      }

      console.log("[STT] Preparing recorder...");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldRouteThroughEarpiece: false,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      clearRecordingTimeout();
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecordingAndTranscribe();
      }, RECORDING_AUTO_STOP_MS);
      console.log("[STT] Recording started");
    } catch (err) {
      console.error("[STT] Failed to start recording:", err);
      Alert.alert("Error", "Could not start recording.");
    }
  }, [audioRecorder, clearRecordingTimeout, stopRecordingAndTranscribe]);

  const toggleRecording = useCallback(() => {
    if (showCoachmark) {
      dismissCoachmark();
    }

    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  }, [
    dismissCoachmark,
    isRecording,
    showCoachmark,
    startRecording,
    stopRecordingAndTranscribe,
  ]);

  useEffect(
    () => () => {
      clearRecordingTimeout();
    },
    [clearRecordingTimeout]
  );

  useEffect(() => {
    if (!isRecording) {
      recordingPulseAnim.stopAnimation();
      recordingPulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(recordingPulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [isRecording, recordingPulseAnim]);

  useEffect(() => {
    if (!isRecording) return;
    console.log("[STT] Recorder state:", {
      canRecord: recorderState.canRecord,
      durationMillis: recorderState.durationMillis,
      metering: recorderState.metering,
      mediaServicesDidReset: recorderState.mediaServicesDidReset,
    });
  }, [
    isRecording,
    recorderState.canRecord,
    recorderState.durationMillis,
    recorderState.metering,
    recorderState.mediaServicesDidReset,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={resetChat}
          className="mr-4 w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
        >
          <SquarePen size={20} color={getThemeColor(colors, "typography-700")} />
        </Pressable>
      ),
    });
  }, [navigation, resetChat, colors]);

  useFocusEffect(
    useCallback(() => {
      // Scroll chat to the bottom when the screen regains focus
      // (e.g. returning from a contact/conversation/event/reminder detail screen).
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(timer);
    }, [])
  );

  const nextMessageId = useCallback((prefix: string) => {
    messageSequenceRef.current += 1;
    assistantDraftState.messageSequence = messageSequenceRef.current;
    return `${prefix}-${Date.now()}-${messageSequenceRef.current}`;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSendingRef.current) return;
      isSendingRef.current = true;

      const userMessage: Message = {
        id: nextMessageId("user"),
        role: "user",
        content: trimmed,
      };

      const loadingMessage: Message = {
        id: nextMessageId("loading"),
        role: "assistant",
        content: "",
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, loadingMessage]);
      setInput("");
      setIsLoading(true);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      try {
        const chatHistory: ChatMessage[] = [
          ...messages
            .filter((m) => !m.isLoading)
            .map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: trimmed },
        ];

        const response = await assistantApi.chat(chatHistory);

        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isLoading);
          return [
            ...filtered,
            {
              id: nextMessageId("assistant"),
              role: "assistant",
              content: response.content,
              ui: response.ui ?? null,
            },
          ];
        });
      } catch (error) {
        console.error("Assistant error:", error);
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isLoading);
          return [
            ...filtered,
            {
              id: nextMessageId("error"),
              role: "assistant",
              content: "Sorry, I encountered an error. Please try again.",
            },
          ];
        });
      } finally {
        isSendingRef.current = false;
        setIsLoading(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    [messages, nextMessageId]
  );

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  const formatDateTime = (value: string, pattern: string, fallback: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return format(date, pattern);
  };

  const renderContactCard = (contact: AssistantContactCard) => {
    const subtitle = [contact.jobTitle, contact.company].filter(Boolean).join(" at ");
    const detail =
      contact.primaryPhone || contact.primaryEmail || contact.location || undefined;
    const initial = contact.displayName?.charAt(0)?.toUpperCase() || "?";

    return (
      <Pressable
        key={contact.id}
        onPress={() =>
          router.push({
            pathname: "/contact/[id]",
            params: { id: contact.id, from: "/(tabs)/assistant" },
          })
        }
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <Text className="text-primary-700 text-base font-semibold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {contact.displayName}
            </Text>
            {subtitle.length > 0 && (
              <Text className="text-typography-600 text-sm mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            {detail && (
              <Text className="text-typography-500 text-sm" numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderConversationCard = (conversation: AssistantConversationCard) => {
    const participants =
      conversation.participants && conversation.participants.length > 0
        ? conversation.participants.join(", ")
        : "Unknown";
    const medium = MEDIUM_META[conversation.medium] || MEDIUM_META.OTHER;
    const MediumIcon = medium.icon;
    const happenedAtLabel = formatDateTime(
      conversation.happenedAt,
      "MMM d, yyyy",
      "Date unknown"
    );

    return (
      <Pressable
        key={conversation.id}
        onPress={() =>
          router.push({
            pathname: "/conversation/[id]",
            params: { id: conversation.id, from: "/(tabs)/assistant" },
          })
        }
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {participants}
            </Text>
            <Text className="text-typography-500 text-sm mt-0.5">
              {medium.label} · {happenedAtLabel}
            </Text>
            {conversation.content && (
              <Text className="text-typography-700 text-sm mt-2" numberOfLines={2}>
                {conversation.content}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEventCard = (event: AssistantEventCard) => {
    const dateLabel = formatDateTime(event.startAt, "MMM d, yyyy", "Date unknown");
    const timeLabel = formatDateTime(event.startAt, "h:mm a", "");
    const participantCount = event.participants?.length || 0;

    return (
      <Pressable
        key={event.id}
        onPress={() =>
          router.push({
            pathname: "/event/[id]",
            params: { id: event.id, from: "/(tabs)/assistant" },
          })
        }
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <CalendarDays size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {event.title}
            </Text>
            <Text className="text-typography-500 text-sm mt-0.5">
              {dateLabel}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
            {event.location && (
              <View className="flex-row items-center mt-1">
                <MapPin size={12} color={getThemeColor(colors, "typography-500")} />
                <Text className="text-typography-500 text-sm ml-1" numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            )}
            {participantCount > 0 && (
              <Text className="text-typography-500 text-sm mt-1">
                {participantCount} participant{participantCount !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderReminderCard = (reminder: AssistantReminderCard) => {
    const participants =
      reminder.participants && reminder.participants.length > 0
        ? reminder.participants.join(", ")
        : "No participants";
    const dueLabel = formatDateTime(reminder.dueAt, "MMM d, yyyy", "Due date unknown");
    const statusLabel = REMINDER_STATUS_META[reminder.status] || reminder.status;

    return (
      <Pressable
        key={reminder.id}
        onPress={() =>
          router.push({
            pathname: "/reminder/[id]",
            params: { id: reminder.id, from: "/(tabs)/assistant" },
          })
        }
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <Bell size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
              {reminder.title}
            </Text>
            <Text className="text-typography-500 text-sm mt-0.5">
              {dueLabel} · {statusLabel}
            </Text>
            <Text className="text-typography-700 text-sm mt-2" numberOfLines={1}>
              {participants}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const openSelectionOption = (option: AssistantSelectionOption) => {
    if (option.entityKind === "contact") {
      router.push({
        pathname: "/contact/[id]",
        params: { id: option.id, from: "/(tabs)/assistant" },
      });
      return;
    }

    if (option.entityKind === "conversation") {
      router.push({
        pathname: "/conversation/[id]",
        params: { id: option.id, from: "/(tabs)/assistant" },
      });
      return;
    }

    if (option.entityKind === "event") {
      router.push({
        pathname: "/event/[id]",
        params: { id: option.id, from: "/(tabs)/assistant" },
      });
      return;
    }

    if (option.entityKind === "reminder") {
      router.push({
        pathname: "/reminder/[id]",
        params: { id: option.id, from: "/(tabs)/assistant" },
      });
      return;
    }
  };

  const renderSelectionOptionCard = (option: AssistantSelectionOption) => {
    const canOpen =
      option.entityKind === "contact" ||
      option.entityKind === "conversation" ||
      option.entityKind === "event" ||
      option.entityKind === "reminder";

    return (
      <View
        key={`${option.entityKind}:${option.id}`}
        className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3"
      >
        <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
          {option.title}
        </Text>
        {option.subtitle ? (
          <Text className="text-typography-600 text-sm mt-1" numberOfLines={1}>
            {option.subtitle}
          </Text>
        ) : null}
        <View className="flex-row mt-3">
          {canOpen ? (
            <Pressable
              onPress={() => openSelectionOption(option)}
              className="rounded-xl border border-border-200 bg-background-50 px-3 py-2 mr-2 active:bg-background-100"
            >
              <Text className="text-typography-700 text-sm font-medium">Open</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => sendMessage(option.selectMessage)}
            disabled={isLoading}
            className={`rounded-xl px-3 py-2 ${isLoading ? "bg-primary-200" : "bg-primary-600 active:bg-primary-700"}`}
          >
            <Text className="text-typography-0 text-sm font-medium">Select</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderAssistantUi = (ui: AssistantUi) => {
    if (ui.kind === "selection") {
      const options = ui.options.slice(0, RESULT_CARD_LIMIT);
      const showCountLabel = ui.options.length > options.length;
      const showScrollableResults = options.length > 2;
      return (
        <View>
          <Text className="text-typography-700 text-sm mb-2">{ui.prompt}</Text>
          {showCountLabel ? (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {options.length} of {ui.options.length} options
            </Text>
          ) : null}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {options.map(renderSelectionOptionCard)}
            </ScrollView>
          ) : (
            options.map(renderSelectionOptionCard)
          )}
        </View>
      );
    }

    if (ui.kind === "created") {
      const cards = ui.cards.slice(0, RESULT_CARD_LIMIT);
      const showCountLabel = ui.cards.length > cards.length;
      const showScrollableResults = cards.length > 2;
      const renderedCards = cards.map((card) => {
        if (card.kind === "contact") {
          return <View key={`contact:${card.contact.id}`}>{renderContactCard(card.contact)}</View>;
        }

        if (card.kind === "conversation") {
          return (
            <View key={`conversation:${card.conversation.id}`}>
              {renderConversationCard(card.conversation)}
            </View>
          );
        }

        if (card.kind === "reminder") {
          return <View key={`reminder:${card.reminder.id}`}>{renderReminderCard(card.reminder)}</View>;
        }

        return <View key={`event:${card.event.id}`}>{renderEventCard(card.event)}</View>;
      });

      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {ui.cards.length} created records
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {renderedCards}
            </ScrollView>
          ) : (
            renderedCards
          )}
        </View>
      );
    }

    if (ui.kind === "contact") {
      return <View>{renderContactCard(ui.contact)}</View>;
    }

    if (ui.kind === "contacts") {
      const cards = ui.contacts.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} contacts
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {cards.map(renderContactCard)}
            </ScrollView>
          ) : (
            cards.map(renderContactCard)
          )}
        </View>
      );
    }

    if (ui.kind === "conversations") {
      const cards = ui.conversations.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} conversations
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {cards.map(renderConversationCard)}
            </ScrollView>
          ) : (
            cards.map(renderConversationCard)
          )}
        </View>
      );
    }

    if (ui.kind === "events") {
      const cards = ui.events.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} events
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {cards.map(renderEventCard)}
            </ScrollView>
          ) : (
            cards.map(renderEventCard)
          )}
        </View>
      );
    }

    if (ui.kind === "reminders") {
      const cards = ui.reminders.slice(0, RESULT_CARD_LIMIT);
      const count = ui.count || cards.length;
      const showCountLabel = count > cards.length;
      const showScrollableResults = cards.length > 2;
      return (
        <View>
          {showCountLabel && (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {cards.length} of {count} reminders
            </Text>
          )}
          {showScrollableResults ? (
            <ScrollView
              className="max-h-[340px]"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle={scrollIndicatorStyle}
              persistentScrollbar
              contentContainerStyle={resultScrollContentStyle}
            >
              {cards.map(renderReminderCard)}
            </ScrollView>
          ) : (
            cards.map(renderReminderCard)
          )}
        </View>
      );
    }

    return null;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const hasContent = item.content && item.content.trim().length > 0;
    const showUi = !isUser && item.ui;
    const assistantAvatar = (
      <View className="w-8 h-8 rounded-xl bg-primary-100 items-center justify-center mr-2 mt-1">
        <Sparkles size={14} color={getThemeColor(colors, "primary-600")} />
      </View>
    );

    if (item.isLoading) {
      return (
        <View className="flex-row justify-start mb-3 px-4">
          {assistantAvatar}
          <View className="bg-background-0 border border-border-200 rounded-2xl rounded-bl-md px-4 py-3 max-w-[78%]">
            <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
          </View>
        </View>
      );
    }

    return (
      <View className="mb-3">
        {hasContent && (
          <View className={`flex-row px-4 ${isUser ? "justify-end" : "justify-start"}`}>
            {!isUser && assistantAvatar}
            <View
              className={`rounded-2xl px-4 py-3 ${
                isUser
                  ? "bg-primary-600 rounded-br-md max-w-[82%]"
                  : "bg-background-0 border border-border-200 rounded-bl-md max-w-[78%]"
              }`}
            >
              <Text
                className="text-base leading-6"
                style={{
                  color: isUser
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-800"),
                }}
              >
                {item.content}
              </Text>
            </View>
          </View>
        )}
        {showUi && (
          <View className={`px-4 pl-14 ${hasContent ? "mt-2" : ""}`}>
            {renderAssistantUi(item.ui!)}
          </View>
        )}
      </View>
    );
  };

  const ListHeader = () => (
    <View className="px-4 pt-4 pb-6">
      <View className="relative overflow-hidden rounded-3xl border border-border-200 bg-background-0 p-5">
        <View className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-primary-100" />
        <View className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-background-100" />

        <View className="flex-row items-center mb-4">
          <View className="w-12 h-12 bg-primary-600 rounded-2xl items-center justify-center mr-3">
            <Sparkles size={20} color={getThemeColor(colors, "typography-0")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-600 text-sm">
              Chat naturally to search, log, and plan.
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap">
          {CAPABILITY_TAGS.map((tag) => (
            <View
              key={tag}
              className="rounded-full border border-border-200 bg-background-50 px-3 py-1.5 mr-2 mb-2"
            >
              <Text className="text-typography-700 text-xs font-medium">{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const ListFooter = () => (
    <View className="pb-6">
      {messages.length === 0 && (
        <View className="px-4 mt-1">
          <View className="rounded-2xl border border-border-200 bg-background-0 p-4">
            <Text className="text-typography-900 text-sm font-semibold">Try a quick prompt</Text>
            <Text className="text-typography-500 text-sm mt-1 mb-3">
              Tap one to get started.
            </Text>
            <View className="flex-row flex-wrap">
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => handleSuggestion(suggestion)}
                  className="flex-row items-center bg-primary-50 border border-primary-200 rounded-full px-3 py-2 mr-2 mb-2 active:bg-primary-100"
                >
                  <Sparkles size={12} color={getThemeColor(colors, "primary-600")} />
                  <Text className="text-primary-700 text-sm ml-1">{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-background-50"
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        contentContainerStyle={{ flexGrow: 1 }}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      <View
        className="border-t border-border-200 px-4 pt-3 bg-background-0"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        {showCoachmark && (
          <View className="mb-3 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-primary-800 text-sm font-semibold">Quick start</Text>
                <Text className="text-primary-700 text-sm mt-1">
                  Try: "I had a call with Alex today" and tap the mic.
                </Text>
              </View>
              <Pressable
                onPress={dismissCoachmark}
                className="px-2 py-1 rounded-lg bg-primary-100 active:bg-primary-200"
              >
                <Text className="text-primary-700 text-xs font-medium">Got it</Text>
              </Pressable>
            </View>
          </View>
        )}
        <View className="flex-row items-end rounded-3xl border border-border-200 bg-background-50 px-3 py-3">
          <View className="flex-1 mr-2">
            <TextInput
              className="text-base text-typography-900 min-h-[52px] max-h-[160px] py-2 px-1"
              placeholder="Ask me anything..."
              placeholderTextColor={getThemeColor(colors, "typography-500")}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!isLoading}
              textAlignVertical="top"
              onSubmitEditing={() => sendMessage(input)}
              submitBehavior="submit"
              blurOnSubmit={false}
              returnKeyType="send"
            />
          </View>
          <Pressable
            onPress={toggleRecording}
            disabled={isLoading || isTranscribing}
            className={`w-11 h-11 rounded-2xl items-center justify-center mr-1 ${
              isRecording
                ? "bg-red-500 active:bg-red-600"
                : "bg-border-200 active:bg-border-300"
            }`}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "typography-500")} />
            ) : (
              <Mic
                size={18}
                color={
                  isRecording
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-500")
                }
              />
            )}
          </Pressable>
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={`w-11 h-11 rounded-2xl items-center justify-center ${
              input.trim() && !isLoading
                ? "bg-primary-600 active:bg-primary-700"
                : "bg-border-200"
            }`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={getThemeColor(colors, "typography-0")} />
            ) : (
              <SendHorizonal
                size={18}
                color={
                  input.trim()
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-400")
                }
              />
            )}
          </Pressable>
        </View>
      </View>
      {isRecording && (
        <Pressable
          onPress={toggleRecording}
          className="absolute inset-0 items-center justify-center px-8"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
        >
          <View className="items-center justify-center">
            <Animated.View
              className="absolute w-36 h-36 rounded-full bg-red-400"
              style={{
                opacity: recordingPulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 0],
                }),
                transform: [
                  {
                    scale: recordingPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.4],
                    }),
                  },
                ],
              }}
            />
            <Animated.View
              className="absolute w-32 h-32 rounded-full bg-red-400"
              style={{
                opacity: recordingPulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.22, 0.38],
                }),
              }}
            />
            <View className="w-28 h-28 rounded-full bg-red-500 items-center justify-center">
              <Mic size={44} color={getThemeColor(colors, "typography-0")} />
            </View>
          </View>
          <Text
            className="mt-6 text-center text-base font-semibold"
            style={{ color: getThemeColor(colors, "typography-0") }}
          >
            Listening...
          </Text>
          <Text
            className="mt-2 text-center text-sm"
            style={{ color: "rgba(255, 255, 255, 0.9)" }}
          >
            Tap to stop
          </Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}
