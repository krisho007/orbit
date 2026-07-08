import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAudioRecorder,
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  RecordingOptions,
  setAudioModeAsync,
  useAudioRecorderState,
} from "expo-audio";
import { SendHorizonal, Mic, SquarePen } from "lucide-react-native";
import { speechApi, userApi } from "../../lib/api";
import { useAssistantChat } from "../../lib/assistant/use-assistant-chat";
import { renderPart } from "../../lib/assistant/render-parts";
import { AnimatedTabScreen } from "../../components/animated-tab-screen";

// Persist draft across tab switches
let draftText = "";

function newConversationId(): string {
  // crypto.randomUUID is available in React Native 0.76+ and Expo Web.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const RECORDING_OPTIONS: RecordingOptions = {
  extension: ".aac",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: "aac_adts", audioEncoder: "aac" },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
};

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const [conversationId, setConversationId] = useState(() => newConversationId());
  const [input, setInput] = useState(draftText);
  const [speechConsent, setSpeechConsent] = useState<boolean | null>(null);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recState = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);

  const chat = useAssistantChat({
    conversationId,
    onError: (err) => {
      console.error("[assistant] chat error:", err);
      Alert.alert("Assistant error", err.message || "Something went wrong.");
    },
  });

  const isStreaming = chat.status === "submitted" || chat.status === "streaming";

  useEffect(() => {
    draftText = input;
  }, [input]);

  useFocusEffect(
    useCallback(() => {
      userApi
        .getConsent()
        .then((r) => setSpeechConsent(r.sttConsent ?? null))
        .catch(() => setSpeechConsent(null));
    }, [])
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    draftText = "";
    chat.sendMessage({ text });
  }, [chat, input, isStreaming]);

  const handleNewConversation = useCallback(() => {
    setConversationId(newConversationId());
    chat.setMessages([]);
    setInput("");
    draftText = "";
  }, [chat]);

  const handleMicPress = useCallback(async () => {
    if (speechConsent === false) {
      Alert.alert(
        "Voice input requires consent",
        "Enable third-party processing (Sarvam AI) in your profile to use voice input.",
        [{ text: "OK" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
      );
      return;
    }
    try {
      if (recState.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) return;
        setTranscribing(true);
        try {
          const transcript = await speechApi.transcribe(uri);
          if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        } finally {
          setTranscribing(false);
        }
        return;
      }
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone permission required");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      await recorder.record();
    } catch (err) {
      console.error("[assistant] recording error", err);
      Alert.alert("Recording error", err instanceof Error ? err.message : "Unknown error");
    }
  }, [recState.isRecording, recorder, speechConsent]);

  const data = useMemo(() => chat.messages, [chat.messages]);

  useEffect(() => {
    if (data.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [data]);

  return (
    <AnimatedTabScreen tabName="assistant">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-white"
        keyboardVerticalOffset={insets.top}
      >
        <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
          <Text className="font-heading-bold text-xl text-slate-900">Assistant</Text>
          <Pressable onPress={handleNewConversation} hitSlop={12} accessibilityLabel="New conversation">
            <SquarePen size={22} color="#334155" />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View className="mt-16 items-center px-8">
              <Text className="font-heading-semibold text-lg text-slate-800 text-center">
                How can I help?
              </Text>
              <Text className="text-sm text-slate-500 mt-2 text-center">
                Ask me to log a conversation, create a reminder, find a contact, or open a screen.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View className={`mb-3 ${isUser ? "items-end" : "items-start"}`}>
                <View
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    isUser ? "bg-sky-600" : "bg-slate-100"
                  }`}
                >
                  {item.parts.map((p: any, i: number) => {
                    const key = `${item.id}-${i}`;
                    if (p.type === "text" && isUser) {
                      return (
                        <Text key={key} className="font-body text-white leading-5">
                          {(p as { text: string }).text}
                        </Text>
                      );
                    }
                    return renderPart(p, key);
                  })}
                </View>
              </View>
            );
          }}
        />

        <View className="flex-row items-end gap-2 border-t border-slate-100 px-3 py-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <TextInput
            className="flex-1 min-h-[40px] max-h-[120px] rounded-2xl border border-slate-200 px-3 py-2 font-body text-slate-900"
            placeholder="Message your assistant"
            placeholderTextColor="#94a3b8"
            value={input}
            onChangeText={setInput}
            multiline
            editable={!isStreaming && !transcribing}
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleMicPress}
            disabled={transcribing || isStreaming}
            className={`h-10 w-10 rounded-full items-center justify-center ${
              recState.isRecording ? "bg-red-500" : "bg-slate-100"
            }`}
            hitSlop={8}
          >
            {transcribing ? (
              <ActivityIndicator color="#334155" />
            ) : (
              <Mic size={18} color={recState.isRecording ? "#fff" : "#334155"} />
            )}
          </Pressable>
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
            className={`h-10 w-10 rounded-full items-center justify-center ${
              input.trim() && !isStreaming ? "bg-sky-600" : "bg-slate-200"
            }`}
            hitSlop={8}
          >
            {isStreaming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <SendHorizonal size={18} color={input.trim() ? "#fff" : "#94a3b8"} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AnimatedTabScreen>
  );
}
