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
  History,
  X,
  Trash2,
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
import { useAuth } from "../../lib/auth";
import { isAssistantCoachmarkSeen, markAssistantCoachmarkSeen } from "../../lib/onboarding";
import { getThemeColor, useThemeColors } from "../../lib/theme";
import { useGluestackUI } from "../../components/ui/gluestack-ui-provider";
import { AiConsentDialog } from "../../components/ai-consent-dialog";
import { HeaderMenu } from "../../components/header-menu";

type Message = ChatMessage & {
  id: string;
  isLoading?: boolean;
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
  "Find contact Krishna",
  "Show my recent conversations",
  "What are my upcoming events?",
  "I had a call with Sarah today",
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
  const [conversationId, setConversationId] = useState<string | null>(assistantDraftState.conversationId);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);
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
    try {
      await userApi.updateConsent({ aiConsent: true, sttConsent: true });
      setConsent(true);
    } catch (error) {
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
      recordingBarAnim.setValue(0);
      return;
    }

    Animated.timing(recordingBarAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

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
  }, [isRecording, recordingPulseAnim, recordingBarAnim]);

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
    [messages, nextMessageId, consent, conversationId]
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
                      ? "text-typography-0 text-sm font-medium"
                      : "text-typography-700 text-sm font-medium"
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
        <View className="w-14 h-14 bg-primary-600 rounded-2xl items-center justify-center mb-4">
          <Sparkles size={22} color={getThemeColor(colors, "typography-0")} />
        </View>
        <Text className="text-typography-900 text-lg font-semibold">What can I help with?</Text>
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
        <EmptyState />
      ) : (
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
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
        <View className="rounded-3xl border border-border-200 bg-background-50 px-3 py-3" style={{ overflow: "hidden" }}>
          {isRecording ? (
            <Animated.View
              className="flex-row items-center min-h-[52px] px-1"
              style={{
                opacity: recordingBarAnim,
                transform: [{
                  translateX: recordingBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [60, 0],
                  }),
                }],
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
              <Text className="text-typography-700 text-base font-medium flex-1">Listening...</Text>
              <Pressable
                onPress={stopRecordingAndTranscribe}
                className="bg-primary-600 rounded-2xl px-5 py-2.5 active:bg-primary-700"
              >
                <Text className="text-typography-0 text-sm font-semibold">OK</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <View className="flex-row items-end">
              <View className="flex-1 mr-2">
                <TextInput
                  className="text-base text-typography-900 min-h-[52px] max-h-[160px] py-2 px-1"
                  placeholder="Ask me anything..."
                  placeholderTextColor={getThemeColor(colors, "typography-500")}
                  value={input}
                  onChangeText={setInput}
                  multiline
                  maxLength={1000}
                  editable={!isLoading}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  onKeyPress={(e) => {
                    if (
                      Platform.OS === "web" &&
                      e.nativeEvent.key === "Enter" &&
                      !e.nativeEvent.shiftKey
                    ) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                />
              </View>
              <Pressable
                onPress={toggleRecording}
                disabled={isLoading || isTranscribing}
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
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-border-200 bg-background-0">
          <Text className="text-typography-900 text-lg font-semibold">Chat History</Text>
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
            <History size={40} color={getThemeColor(colors, "typography-300")} />
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
                className="bg-background-0 border border-border-100 rounded-2xl p-4 mb-3 active:bg-background-50"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-typography-900 font-semibold text-base" numberOfLines={1}>
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
