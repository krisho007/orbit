import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";
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
  Modal,
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
  History,
  X,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Pencil,
  ClipboardCheck,
} from "lucide-react-native";
import {
  assistantApi,
  speechApi,
  userApi,
  ChatMessage,
  AssistantUi,
  AssistantAction,
  AssistantContactCard,
  AssistantConversationCard,
  AssistantEventCard,
  AssistantReminderCard,
  AssistantSelectionOption,
  AssistantConversationSummary,
} from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { contactKeys, conversationKeys, eventKeys, reminderKeys } from "../../lib/query-keys";
import { useAuth } from "../../lib/auth";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useGluestackUI } from "../../components/ui/gluestack-ui-provider";
import { AiConsentDialog } from "../../components/ai-consent-dialog";
import { HeaderMenu } from "../../components/header-menu";
import { HuskyLogo } from "../../components/HuskyLogo";
import { UpcomingEventsWidget } from "../../components/upcoming-events-widget";

type Message = ChatMessage & {
  id: string;
  isLoading?: boolean;
  thumbsUp?: boolean;
  thumbsDown?: boolean;
  /** Shown in the chat bubble instead of `content` (e.g. friendly selection text). */
  displayContent?: string;
};

type AssistantDraftState = {
  messages: Message[];
  input: string;
  messageSequence: number;
  conversationId: string | null;
};

const assistantDraftState: AssistantDraftState = {
  messages: [],
  input: "",
  messageSequence: 0,
  conversationId: null,
};

const SUGGESTIONS = [
  "Add a new contact: Lisa Chen, PM at Google",
  "Remind me to call John Vegas on 23rd March",
  "When did I speak with Katie last?",
  "I had a call with Sarah today",
  "Feeling happy after the sprint demo",
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { resolvedColorMode } = useGluestackUI();
  const scrollIndicatorStyle = resolvedColorMode === "dark" ? "white" : "black";
  const resultScrollContentStyle = Platform.OS === "android" ? { paddingRight: 6 } : undefined;
  const [messages, setMessages] = useState<Message[]>(assistantDraftState.messages);
  const [input, setInput] = useState(assistantDraftState.input);
  const [conversationId, setConversationId] = useState<string | null>(assistantDraftState.conversationId);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<AssistantConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const audioRecorder = useAudioRecorder(STT_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;
  const flatListRef = useRef<FlatList>(null);
  const isSendingRef = useRef(false);
  const messageSequenceRef = useRef(assistantDraftState.messageSequence);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRecordingRef = useRef(false);
  const recordingPulseAnim = useRef(new Animated.Value(0)).current;
  const recordingBarAnim = useRef(new Animated.Value(0)).current;
  const recordingFillAnim = useRef(new Animated.Value(0)).current;

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

  // Load consent state on mount
  useEffect(() => {
    let cancelled = false;
    const loadConsent = async () => {
      try {
        const consentData = await userApi.getConsent();
        if (!cancelled) {
          setConsent(consentData.aiConsent && consentData.sttConsent);
        }
      } catch (error) {
        console.error("Failed to load consent:", error);
      }
    };
    loadConsent();
    return () => { cancelled = true; };
  }, []);

  const handleConsentAgree = useCallback(async () => {
    setShowConsentDialog(false);
    setConsent(true);
    try {
      await userApi.updateConsent({ aiConsent: true, sttConsent: true });
    } catch (error) {
      setConsent(false);
      Alert.alert("Error", "Failed to save consent. Please try again.");
    }
  }, []);

  useEffect(() => {
    // Keep only stable messages in cache so returning from detail pages restores results.
    assistantDraftState.messages = messages.filter((message) => !message.isLoading);
  }, [messages]);

  useEffect(() => {
    assistantDraftState.input = input;
  }, [input]);

  useEffect(() => {
    assistantDraftState.conversationId = conversationId;
  }, [conversationId]);

  useEffect(
    () => () => {
      assistantDraftState.messages = assistantDraftState.messages.filter(
        (message) => !message.isLoading
      );
      assistantDraftState.messageSequence = messageSequenceRef.current;
    },
    []
  );

  const resetChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setConversationId(null);
    setIsLoading(false);
    isSendingRef.current = false;
    messageSequenceRef.current = 0;
    assistantDraftState.messages = [];
    assistantDraftState.input = "";
    assistantDraftState.messageSequence = 0;
    assistantDraftState.conversationId = null;
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
    // Check STT consent before recording
    if (!consent) {
      setShowConsentDialog(true);
      return;
    }

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
  }, [audioRecorder, clearRecordingTimeout, stopRecordingAndTranscribe, consent]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  }, [
    isRecording,
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
      recordingBarAnim.setValue(0);
      recordingFillAnim.setValue(0);
      return;
    }

    // Fade in the content
    Animated.timing(recordingBarAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Slow water-like fill across the entire text box
    Animated.timing(recordingFillAnim, {
      toValue: 1,
      duration: RECORDING_AUTO_STOP_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Gentle pulse on the red dot
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(recordingPulseAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [isRecording, recordingPulseAnim, recordingBarAnim, recordingFillAnim]);

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await assistantApi.listConversations();
      setHistoryItems(data.conversations);
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = useCallback(() => {
    setShowHistory(true);
    loadHistory();
  }, [loadHistory]);

  const loadConversation = useCallback(async (id: string) => {
    setShowHistory(false);
    setIsLoading(true);
    try {
      const data = await assistantApi.getConversation(id);
      setConversationId(data.id);
      messageSequenceRef.current = 0;
      const loadedMessages: Message[] = data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ui: m.ui ?? undefined,
        thumbsUp: m.thumbsUp,
        thumbsDown: m.thumbsDown,
      }));
      setMessages(loadedMessages);
      setInput("");
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error) {
      console.error("Failed to load conversation:", error);
      Alert.alert("Error", "Failed to load conversation.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteHistoryItem = useCallback(async (id: string) => {
    try {
      await assistantApi.deleteConversation(id);
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      if (conversationId === id) {
        resetChat();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }, [conversationId, resetChat]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={openHistory}
            className="mr-1 w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
          >
            <History size={20} color={getThemeColor(colors, "typography-700")} />
          </Pressable>
          <Pressable
            onPress={resetChat}
            className="mr-1 w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
          >
            <SquarePen size={20} color={getThemeColor(colors, "typography-700")} />
          </Pressable>
          <HeaderMenu />
        </View>
      ),
    });
  }, [navigation, resetChat, openHistory, colors]);

  useFocusEffect(
    useCallback(() => {
      // Refresh upcoming events when the screen regains focus
      queryClient.invalidateQueries({ queryKey: eventKeys.upcoming() });
      // Scroll chat to the bottom when the screen regains focus
      // (e.g. returning from a contact/conversation/event/reminder detail screen).
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(timer);
    }, [queryClient])
  );

  const nextMessageId = useCallback((prefix: string) => {
    messageSequenceRef.current += 1;
    assistantDraftState.messageSequence = messageSequenceRef.current;
    return `${prefix}-${Date.now()}-${messageSequenceRef.current}`;
  }, []);

  const sendMessage = useCallback(
    async (text: string, displayText?: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSendingRef.current) return;

      // Check AI consent before sending
      if (!consent) {
        setShowConsentDialog(true);
        return;
      }

      isSendingRef.current = true;

      const userMessage: Message = {
        id: nextMessageId("user"),
        role: "user",
        content: trimmed,
        displayContent: displayText,
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

        const response = await assistantApi.chat(
          chatHistory,
          conversationId ?? undefined,
          (status) => setStatusText(status)
        );

        if (response.conversationId) {
          setConversationId(response.conversationId);
        }

        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.isLoading);
          return [
            ...filtered,
            {
              id: nextMessageId("assistant"),
              role: "assistant",
              content: response.content,
              ui: response.ui ?? null,
              actions: response.actions,
            },
          ];
        });

        // Invalidate list caches when the assistant creates objects
        if (response.ui?.kind === "created") {
          const kinds = new Set(response.ui.cards.map((c) => c.kind));
          if (kinds.has("contact")) queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
          if (kinds.has("conversation")) queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
          if (kinds.has("event")) queryClient.invalidateQueries({ queryKey: eventKeys.all });
          if (kinds.has("reminder")) queryClient.invalidateQueries({ queryKey: reminderKeys.lists() });
        }
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
        setStatusText("");
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    },
    [messages, nextMessageId, consent, conversationId, queryClient]
  );

  // Derive whether confirmation buttons are pending (last assistant message has actions)
  const hasActiveConfirmation = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.isLoading) continue;
      if (m.role === "assistant") return Boolean(m.actions?.length);
      break; // if the last non-loading message is a user message, no pending confirmation
    }
    return false;
  })();

  const inputDisabled = isLoading || hasActiveConfirmation;

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
        className="bg-background-0 border border-border-200 rounded-xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <Text className="text-primary-700 text-base font-body-semibold">{initial}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
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
        className="bg-background-0 border border-border-200 rounded-xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <MediumIcon size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
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
        className="bg-background-0 border border-border-200 rounded-xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <CalendarDays size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
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
        className="bg-background-0 border border-border-200 rounded-xl p-4 mb-3 active:bg-background-50"
      >
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl bg-primary-100 items-center justify-center mr-3">
            <Bell size={18} color={getThemeColor(colors, "primary-600")} />
          </View>
          <View className="flex-1">
            <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
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
      <Pressable
        key={`${option.entityKind}:${option.id}`}
        onPress={() => sendMessage(option.selectMessage, `Selected: ${option.title}`)}
        disabled={isLoading}
        className={`flex-row items-center rounded-xl border border-border-200 px-4 py-3 mb-2 ${
          isLoading ? "bg-background-50 opacity-60" : "bg-background-0 active:bg-primary-50 active:border-primary-300"
        }`}
      >
        <View className="w-9 h-9 rounded-full bg-primary-100 items-center justify-center mr-3">
          <Text className="text-primary-700 font-body-bold text-sm">
            {(option.title || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
            {option.title}
          </Text>
          {option.subtitle ? (
            <Text className="text-typography-500 text-sm" numberOfLines={1}>
              {option.subtitle}
            </Text>
          ) : null}
        </View>
        {canOpen ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              openSelectionOption(option);
            }}
            hitSlop={8}
            className="rounded-lg border border-border-200 bg-background-50 px-2.5 py-1.5 active:bg-background-100"
          >
            <Text className="text-typography-600 text-xs font-body-medium">View</Text>
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  const renderAssistantUi = (ui: AssistantUi) => {
    if (ui.kind === "selection") {
      const options = ui.options.slice(0, RESULT_CARD_LIMIT);
      const showCountLabel = ui.options.length > options.length;
      const showScrollableResults = options.length > 2;
      return (
        <View>
          {showCountLabel ? (
            <Text className="text-typography-500 text-xs mb-2">
              Showing {options.length} of {ui.options.length}
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

    if (ui.kind === "confirmation") {
      const FIELD_LABELS: Record<string, string> = {
        displayName: "Name",
        company: "Company",
        jobTitle: "Job Title",
        primaryPhone: "Phone",
        primaryEmail: "Email",
        notes: "Notes",
        medium: "Medium",
        happenedAt: "Date",
        content: "Notes",
        title: "Title",
        eventType: "Type",
        startAt: "Start",
        endAt: "End",
        location: "Location",
        dueAt: "Due",
        participants: "With",
        participantNames: "With",
        description: "Description",
      };

      const ENTITY_TYPE_LABELS: Record<string, string> = {
        contact: "Proposed Contact",
        conversation: "Proposed Conversation",
        event: "Proposed Event",
        reminder: "Proposed Reminder",
      };

      const MEDIUM_LABELS: Record<string, string> = {
        PHONE_CALL: "Phone Call",
        WHATSAPP: "WhatsApp",
        EMAIL: "Email",
        CHANCE_ENCOUNTER: "Chance Encounter",
        ONLINE_MEETING: "Online Meeting",
        IN_PERSON_MEETING: "In-Person Meeting",
        OTHER: "Other",
      };

      const EVENT_TYPE_LABELS: Record<string, string> = {
        MEETING: "Meeting",
        CALL: "Call",
        CONFERENCE: "Conference",
        WORKSHOP: "Workshop",
        SOCIAL: "Social",
        BIRTHDAY: "Birthday",
        ANNIVERSARY: "Anniversary",
        HOLIDAY: "Holiday",
        OTHER: "Other",
      };

      const formatTimeToken = (token: string): string => {
        if (token === "NOW") return "Now";
        if (token === "TODAY") return "Today";
        if (token === "TOMORROW") return "Tomorrow";
        if (token === "YESTERDAY") return "Yesterday";
        const todayMatch = token.match(/^TODAY_(\d{1,2}):(\d{2})$/);
        if (todayMatch) return `Today at ${formatTimeParts(todayMatch[1]!, todayMatch[2]!)}`;
        const tomorrowMatch = token.match(/^TOMORROW_(\d{1,2}):(\d{2})$/);
        if (tomorrowMatch) return `Tomorrow at ${formatTimeParts(tomorrowMatch[1]!, tomorrowMatch[2]!)}`;
        const yesterdayMatch = token.match(/^YESTERDAY_(\d{1,2}):(\d{2})$/);
        if (yesterdayMatch) return `Yesterday at ${formatTimeParts(yesterdayMatch[1]!, yesterdayMatch[2]!)}`;
        const nextWeekMatch = token.match(/^NEXT_WEEK_(\d{1,2}):(\d{2})$/);
        if (nextWeekMatch) return `Next week at ${formatTimeParts(nextWeekMatch[1]!, nextWeekMatch[2]!)}`;
        if (token === "NEXT_WEEK") return "Next week";
        const plusDaysMatch = token.match(/^\+(\d+)d(?:_(\d{1,2}):(\d{2}))?$/);
        if (plusDaysMatch) {
          const days = plusDaysMatch[1]!;
          if (plusDaysMatch[2]) return `In ${days} days at ${formatTimeParts(plusDaysMatch[2], plusDaysMatch[3]!)}`;
          return `In ${days} days`;
        }
        const minusDaysMatch = token.match(/^-(\d+)d(?:_(\d{1,2}):(\d{2}))?$/);
        if (minusDaysMatch) {
          const days = minusDaysMatch[1]!;
          if (minusDaysMatch[2]) return `${days} days ago at ${formatTimeParts(minusDaysMatch[2], minusDaysMatch[3]!)}`;
          return `${days} days ago`;
        }
        return token;
      };

      const formatTimeParts = (h: string, m: string): string => {
        const hour = parseInt(h, 10);
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${h12}:${m} ${ampm}`;
      };

      const formatFieldValue = (key: string, value: unknown): string => {
        if (value == null) return "";
        if (key === "medium" && typeof value === "string") return MEDIUM_LABELS[value] || value;
        if (key === "eventType" && typeof value === "string") return EVENT_TYPE_LABELS[value] || value;
        if ((key === "happenedAt" || key === "startAt" || key === "endAt" || key === "dueAt") && typeof value === "string") {
          const tokenResult = formatTimeToken(value);
          if (tokenResult !== value) return tokenResult;
          return formatDateTime(value, "MMM d, yyyy 'at' h:mm a", String(value));
        }
        if (Array.isArray(value)) return value.join(", ");
        return String(value);
      };

      const renderConfirmationItem = (entityType: string, details: Record<string, unknown>, index: number) => {
        const entries = Object.entries(details).filter(
          ([key, v]) => v != null && String(v).trim().length > 0 && !key.startsWith("_")
        );
        if (entries.length === 0) return null;

        const canEdit = entityType === "contact" || entityType === "conversation" || entityType === "event" || entityType === "reminder";

        const handleEdit = () => {
          Keyboard.dismiss();
          const prefill = JSON.stringify(details);
          const routes: Record<string, string> = {
            contact: "/contact/new",
            conversation: "/conversation/new",
            event: "/event/new",
            reminder: "/reminder/new",
          };
          const pathname = routes[entityType];
          if (pathname) {
            router.push({ pathname: pathname as any, params: { prefill } });
          }
        };

        return (
          <View key={index} className={`bg-background-0 border border-border-200 rounded-xl p-4${index > 0 ? " mt-3" : ""}`}>
            <View className="flex-row items-center mb-3">
              <View className="w-8 h-8 rounded-lg bg-primary-100 items-center justify-center mr-2">
                <ClipboardCheck size={16} color={getThemeColor(colors, "primary-600")} />
              </View>
              <Text className="text-typography-800 font-body-semibold text-sm flex-1">{ENTITY_TYPE_LABELS[entityType] || "Proposed Details"}</Text>
              {canEdit && (
                <Pressable
                  onPress={handleEdit}
                  className="flex-row items-center px-3 py-1.5 rounded-lg bg-background-50 border border-border-200 active:bg-background-100"
                >
                  <Pencil size={14} color={getThemeColor(colors, "typography-600")} />
                  <Text className="text-typography-600 text-sm font-body-medium ml-1.5">Edit</Text>
                </Pressable>
              )}
            </View>
            {entries.map(([key, value]) => (
              <View key={key} className="flex-row py-1.5">
                <Text className="text-typography-500 text-sm w-28">{FIELD_LABELS[key] || key}</Text>
                <Text className="text-typography-900 text-sm flex-1 flex-shrink">{formatFieldValue(key, value)}</Text>
              </View>
            ))}
          </View>
        );
      };

      // Multi-action: render one card per item
      if (ui.items && ui.items.length > 0) {
        return (
          <View>
            {ui.items.map((item, i) => renderConfirmationItem(item.entityType, item.details, i))}
          </View>
        );
      }

      // Single action (backward compat)
      if (ui.details && Object.keys(ui.details).length > 0) {
        return renderConfirmationItem(ui.entityType || "contact", ui.details, 0);
      }
    }

    return null;
  };

  const handleFeedback = useCallback(
    (messageId: string, type: "up" | "down") => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          if (type === "up") {
            const newUp = !m.thumbsUp;
            return { ...m, thumbsUp: newUp, thumbsDown: newUp ? false : m.thumbsDown };
          }
          const newDown = !m.thumbsDown;
          return { ...m, thumbsDown: newDown, thumbsUp: newDown ? false : m.thumbsUp };
        })
      );
      // Fire-and-forget API call — only for persisted messages (server-assigned UUIDs)
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;
      const isUp = type === "up";
      const feedback = isUp
        ? { thumbsUp: !msg.thumbsUp, thumbsDown: !msg.thumbsUp ? false : msg.thumbsDown }
        : { thumbsDown: !msg.thumbsDown, thumbsUp: !msg.thumbsDown ? false : msg.thumbsUp };
      assistantApi.feedbackMessage(messageId, feedback).catch(() => {});
    },
    [messages]
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    const hasContent = item.content && item.content.trim().length > 0;
    const showUi = !isUser && item.ui;
    const assistantAvatar = (
      <View className="w-8 h-8 rounded-xl bg-primary-100 items-center justify-center mr-2 mt-1">
        <HuskyLogo size={20} color={getThemeColor(colors, "primary-600")} />
      </View>
    );

    if (item.isLoading) {
      return (
        <View className="flex-row justify-start mb-3 px-4">
          {assistantAvatar}
          <View className="bg-background-0 border border-border-200 rounded-2xl rounded-bl-md px-4 py-3 max-w-[78%]">
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color={getThemeColor(colors, "primary-600")} />
              {statusText ? (
                <Text className="text-typography-500 text-sm ml-2">{statusText}</Text>
              ) : null}
            </View>
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
                selectable
                className="text-base leading-6"
                style={{
                  color: isUser
                    ? getThemeColor(colors, "typography-0")
                    : getThemeColor(colors, "typography-800"),
                }}
              >
                {item.displayContent || item.content}
              </Text>
            </View>
          </View>
        )}
        {!isUser && hasContent && !item.isLoading && (
          <View className="flex-row items-center ml-14 mt-1 px-4">
            <Pressable
              onPress={() => handleFeedback(item.id, "up")}
              className="w-7 h-7 rounded-lg items-center justify-center active:bg-background-100 mr-0.5"
            >
              <ThumbsUp
                size={13}
                color={
                  item.thumbsUp
                    ? getThemeColor(colors, "primary-600")
                    : getThemeColor(colors, "typography-400")
                }
                fill={item.thumbsUp ? getThemeColor(colors, "primary-600") : "none"}
              />
            </Pressable>
            <Pressable
              onPress={() => handleFeedback(item.id, "down")}
              className="w-7 h-7 rounded-lg items-center justify-center active:bg-background-100"
            >
              <ThumbsDown
                size={13}
                color={
                  item.thumbsDown
                    ? getThemeColor(colors, "error-600")
                    : getThemeColor(colors, "typography-400")
                }
                fill={item.thumbsDown ? getThemeColor(colors, "error-600") : "none"}
              />
            </Pressable>
          </View>
        )}
        {showUi && (
          <View className={`px-4 pl-14 ${hasContent ? "mt-2" : ""}`}>
            {renderAssistantUi(item.ui!)}
          </View>
        )}
        {!isUser && item.actions?.length ? (
          <View className="flex-row gap-2 mt-2 px-4 ml-10">
            {item.actions.map((action, i) => (
              <Pressable
                key={i}
                onPress={() => sendMessage(action.message)}
                disabled={isLoading}
                className={
                  action.style === "primary"
                    ? `flex-1 rounded-xl px-3 py-2.5 items-center ${isLoading ? "bg-primary-200" : "bg-primary-600 active:bg-primary-700"}`
                    : "flex-1 rounded-xl px-3 py-2.5 items-center border border-border-200 bg-background-50 active:bg-background-100"
                }
              >
                <Text
                  className={
                    action.style === "primary"
                      ? "text-typography-0 text-sm font-body-medium"
                      : "text-typography-700 text-sm font-body-medium"
                  }
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const EmptyState = () => (
    <View className="flex-1 justify-center px-5 pb-6">
      <View className="items-center mb-8">
        <HuskyLogo size={56} color={getThemeColor(colors, "primary-600")} />
        <Text className="text-typography-900 text-lg font-body-semibold mt-4">What can I help with?</Text>
        <Text className="text-typography-500 text-sm mt-1">
          Search, log, and plan — just ask.
        </Text>
      </View>
      <View className="flex-row flex-wrap justify-center">
        {SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            onPress={() => handleSuggestion(suggestion)}
            className="bg-background-0 border border-border-200 rounded-2xl px-4 py-3 m-1 active:bg-background-100"
          >
            <Text className="text-typography-800 text-sm">{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <AnimatedTabScreen tabName="assistant">
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-background-50"
      keyboardVerticalOffset={headerHeight}
    >
      {messages.length === 0 ? (
        <View className="flex-1">
          <UpcomingEventsWidget />
          <EmptyState />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListHeaderComponent={<UpcomingEventsWidget />}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 16, paddingBottom: 8 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />
      )}

      <View
        className="border-t border-border-200 px-4 pt-3 bg-background-0"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View className="rounded-3xl border border-border-200 bg-background-50 px-3 py-3" style={{ overflow: "hidden" }}>
          {isRecording ? (
            <View className="min-h-[52px]" style={{ position: "relative" }}>
              {/* Water fill background */}
              <Animated.View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: recordingFillAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                  backgroundColor: getThemeColor(colors, "primary-100"),
                  borderRadius: 20,
                  opacity: 0.5,
                }}
              />
              {/* Content overlay */}
              <Animated.View
                className="flex-row items-center min-h-[52px] px-1"
                style={{
                  opacity: recordingBarAnim,
                }}
              >
                <Animated.View
                  className="w-3.5 h-3.5 rounded-full bg-red-500 mr-3"
                  style={{
                    opacity: recordingPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.3],
                    }),
                    transform: [{
                      scale: recordingPulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.3],
                      }),
                    }],
                  }}
                />
                <Text className="text-typography-700 text-base font-body-medium flex-1">Listening...</Text>
                <Pressable
                  onPress={stopRecordingAndTranscribe}
                  className="bg-primary-600 rounded-2xl px-5 py-2.5 active:bg-primary-700"
                >
                  <Text className="text-typography-0 text-sm font-body-semibold">Done</Text>
                </Pressable>
              </Animated.View>
            </View>
          ) : (
            <View className="flex-row items-end">
              <View className="flex-1 mr-2">
                <TextInput
                  className="text-base text-typography-900 min-h-[52px] max-h-[160px] py-2 px-1"
                  placeholder={hasActiveConfirmation ? "Choose an option above..." : "Ask me anything..."}
                  placeholderTextColor={getThemeColor(colors, "typography-500")}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  maxLength={2000}
                  editable={!inputDisabled}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  onKeyPress={(e) => {
                    if (
                      Platform.OS === "web" &&
                      e.nativeEvent.key === "Enter" &&
                      !(e.nativeEvent as unknown as KeyboardEvent).shiftKey
                    ) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                />
              </View>
              <Pressable
                onPress={toggleRecording}
                disabled={inputDisabled || isTranscribing}
                className="w-11 h-11 rounded-2xl items-center justify-center mr-1 bg-border-200 active:bg-border-300"
              >
                {isTranscribing ? (
                  <ActivityIndicator size="small" color={getThemeColor(colors, "typography-500")} />
                ) : (
                  <Mic size={18} color={getThemeColor(colors, "typography-500")} />
                )}
              </Pressable>
              <Pressable
                onPress={() => sendMessage(input)}
                disabled={!input.trim() || inputDisabled}
                className={`w-11 h-11 rounded-2xl items-center justify-center ${
                  input.trim() && !inputDisabled
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
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
    <Modal
      visible={showHistory}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowHistory(false)}
    >
      <View className="flex-1 bg-background-50">
        <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-3 border-b border-border-200 bg-background-0">
          <View className="flex-row items-center" style={{ marginLeft: 4 }}>
            <HuskyLogo size={46} color={getThemeColor(colors, "primary-700")} />
            <Text style={{ fontSize: 20, fontWeight: "700", fontFamily: Platform.select({ ios: "Lora_700Bold", android: "Lora_700Bold", default: "Lora, Georgia, serif" }), color: getThemeColor(colors, "typography-900"), marginLeft: 8 }}>
              Chat History
            </Text>
          </View>
          <Pressable
            onPress={() => setShowHistory(false)}
            className="w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
          >
            <X size={20} color={getThemeColor(colors, "typography-700")} />
          </Pressable>
        </View>
        {historyLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={getThemeColor(colors, "primary-600")} />
          </View>
        ) : historyItems.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <HuskyLogo size={48} color={getThemeColor(colors, "typography-300")} />
            <Text className="text-typography-500 text-base mt-4 text-center">
              No conversations yet. Start chatting to see your history here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={historyItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => loadConversation(item.id)}
                className="bg-background-0 border border-border-200 rounded-xl p-4 mb-3 active:bg-background-50"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-typography-900 font-body-semibold text-base" numberOfLines={1}>
                      {item.title || "Untitled"}
                    </Text>
                    {item.lastMessage && (
                      <Text className="text-typography-500 text-sm mt-1" numberOfLines={2}>
                        {item.lastMessage.content}
                      </Text>
                    )}
                    <Text className="text-typography-400 text-xs mt-1.5">
                      {format(new Date(item.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => deleteHistoryItem(item.id)}
                    className="w-9 h-9 rounded-xl items-center justify-center active:bg-background-100"
                    hitSlop={8}
                  >
                    <Trash2 size={16} color={getThemeColor(colors, "typography-400")} />
                  </Pressable>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
    <AiConsentDialog
      visible={showConsentDialog}
      onAgree={handleConsentAgree}
      onDismiss={() => setShowConsentDialog(false)}
      onViewDetails={() => {
        setShowConsentDialog(false);
        router.push("/data-privacy" as any);
      }}
    />
    </AnimatedTabScreen>
  );
}
