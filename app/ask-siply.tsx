import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Screen } from "../src/shared/components/Screen";
import { Button } from "../src/shared/components/Button";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { useInternetStatus } from "../src/shared/network/NetworkStatusProvider";
import { useHydrationStore } from "../src/features/hydration/state/hydrationStore";
import { buildAiHydrationContext } from "../src/features/hydration/ai/context";
import {
  AI_PROVIDER_NAMES,
  ASK_SIPLY_MAX_PRIOR_TURNS,
  ASK_SIPLY_MAX_QUESTION_LENGTH,
} from "../src/features/hydration/ai/constants";
import { generateAiText } from "../src/features/hydration/ai/client";
import { getAiErrorCode, getAskSiplyErrorMessage } from "../src/features/hydration/ai/errors";
import { ASK_SIPLY_SYSTEM_PROMPT, buildAskMessages } from "../src/features/hydration/ai/prompts";
import { useAiSettings } from "../src/features/hydration/ai/state";
import type { AiConversationMessage } from "../src/features/hydration/ai/types";

type DisplayMessage = AiConversationMessage & { id: string; truncated?: boolean };

export default function AskSiplyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const internetStatus = useInternetStatus();
  const settings = useHydrationStore((state) => state.settings);
  const progress = useHydrationStore((state) => state.progress);
  const history = useHydrationStore((state) => state.history);
  const {
    hydrated,
    supported,
    preferences,
    configuredProviders,
    getCredential,
    markProviderNeedsAttention,
  } = useAiSettings();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [androidKeyboardVisible, setAndroidKeyboardVisible] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  const followLatestRef = useRef(true);

  const scrollToLatest = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setAndroidKeyboardVisible(true);
      if (followLatestRef.current) scrollToLatest();
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (followLatestRef.current) scrollToLatest();
  }, [messages.length, sending]);

  const context = useMemo(
    () => buildAiHydrationContext({ settings, progress, history }, "ask"),
    [history, progress, settings]
  );
  const activeProvider = preferences.activeProvider;
  const hasCredential = Boolean(
    activeProvider && configuredProviders.includes(activeProvider)
  );
  const providerNeedsAttention = Boolean(
    activeProvider && preferences.needsAttention.includes(activeProvider)
  );
  const unavailableReason = !supported
    ? "Ask Siply is available in the iOS and Android app, where your key can be stored securely."
    : !hydrated
      ? "Loading your AI settings…"
      : internetStatus === "checking"
          ? "Checking your internet connection…"
          : internetStatus === "offline"
            ? `You're offline — Ask Siply needs an internet connection to reach ${activeProvider ? AI_PROVIDER_NAMES[activeProvider] : "your provider"}.`
            : providerNeedsAttention
              ? "Your selected API key needs attention. Reconnect it in AI settings."
              : !hasCredential
                ? "Connect and select an AI provider before asking Siply."
                : null;

  const suggestedQuestions = useMemo(() => {
    const suggestions = [
      "How consistent have I been this week?",
      "When do I usually drink the most?",
      "What pattern stands out in my hydration?",
    ];
    const trackedLast14 = context.dailyHistory.slice(-14).filter((day) => day.totalMl > 0).length;
    if (trackedLast14 >= 8) suggestions.push("How does this week compare with last week?");
    if (context.today.consumedMl > 0) suggestions.push("How is today going so far?");
    return suggestions.slice(0, 4);
  }, [context]);

  const handleSend = async (input = question, displayUser = true) => {
    const trimmed = input.trim();
    if (!trimmed || !activeProvider || !hasCredential || unavailableReason || sending) return;
    const credential = await getCredential(activeProvider);
    if (!credential) {
      setError("Your selected provider key is no longer available. Open AI settings to reconnect it.");
      return;
    }

    const userMessage: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const priorMessages = messages
      .slice(-(ASK_SIPLY_MAX_PRIOR_TURNS * 2))
      .map(({ role, content }) => ({ role, content }));
    if (displayUser) setQuestion("");
    setError(null);
    setSending(true);
    followLatestRef.current = true;
    if (displayUser) setMessages((current) => [...current, userMessage]);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const answer = await generateAiText({
        credential,
        systemPrompt: ASK_SIPLY_SYSTEM_PROMPT,
        messages: buildAskMessages(context, priorMessages, trimmed),
        maxOutputTokens: 600,
        signal: controller.signal,
      });
      setMessages((current) => [
        ...current.map((message) => ({ ...message, truncated: false })),
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: answer.text,
          truncated: answer.truncated,
        },
      ]);
    } catch (caught) {
      if (controller.signal.aborted) return;
      const code = internetStatus === "offline" ? "offline" : getAiErrorCode(caught);
      if (code === "invalid_credentials") {
        await markProviderNeedsAttention(activeProvider);
      }
      setError(getAskSiplyErrorMessage(code));
    } finally {
      if (!controller.signal.aborted) setSending(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : androidKeyboardVisible ? "height" : undefined}
      keyboardVerticalOffset={0}
    >
      <Screen contentStyle={styles.screenContent}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={28} color={theme.colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleRow}>
            <MaterialCommunityIcons name="creation" size={22} color={theme.colors.accent} />
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Ask Siply</Text>
          </View>
          <Pressable
            onPress={() => setMessages([])}
            style={[styles.iconButton, { opacity: messages.length ? 1 : 0.35 }]}
            disabled={!messages.length}
            accessibilityLabel="Clear conversation"
          >
            <MaterialIcons name="delete-outline" size={25} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={[styles.listContent, messages.length === 0 && styles.emptyList]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            followLatestRef.current = distanceFromBottom < 72;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (followLatestRef.current) scrollToLatest();
          }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.aiBubble,
                {
                  backgroundColor:
                    item.role === "user" ? theme.colors.accent : theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              {item.role === "assistant" ? (
                <View style={styles.aiLabelRow}>
                  <MaterialCommunityIcons name="creation" size={14} color={theme.colors.accent} />
                  <Text style={[styles.aiLabel, { color: theme.colors.accent }]}>AI</Text>
                </View>
              ) : null}
              <Text
                style={[
                  styles.messageText,
                  { color: item.role === "user" ? theme.colors.surface : theme.colors.textPrimary },
                ]}
              >
                {item.content}
              </Text>
              {item.role === "assistant" && item.truncated ? (
                <Pressable
                  onPress={() => void handleSend(
                    "Continue the previous answer from exactly where it stopped. Do not repeat earlier text.",
                    false
                  )}
                  disabled={sending || Boolean(unavailableReason)}
                  style={({ pressed }) => [styles.continueButton, { opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.continueText, { color: theme.colors.accent }]}>Continue</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="water-outline" size={42} color={theme.colors.accent} />
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>Ask about your hydration</Text>
              <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>Choose a question or write your own. Answers use only the local summary shown to you in AI settings.</Text>
              <View style={styles.suggestions}>
                {suggestedQuestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => void handleSend(suggestion)}
                    disabled={Boolean(unavailableReason) || sending}
                    style={({ pressed }) => [
                      styles.suggestion,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        opacity: unavailableReason || sending ? 0.5 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.suggestionText, { color: theme.colors.textPrimary }]}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={sending ? <ActivityIndicator color={theme.colors.accent} style={styles.loader} /> : null}
        />

        {unavailableReason ? (
          <View style={[styles.notice, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
            <MaterialCommunityIcons
              name={internetStatus === "offline" ? "wifi-off" : "information-outline"}
              size={21}
              color={theme.colors.textSecondary}
            />
            <Text style={[styles.noticeText, { color: theme.colors.textSecondary }]}>{unavailableReason}</Text>
            {(!hasCredential || providerNeedsAttention) && supported && hydrated ? (
              <Button label="Open AI settings" variant="secondary" onPress={() => router.push("/ai-settings")} />
            ) : null}
          </View>
        ) : null}
        {error ? <Text style={[styles.error, { color: theme.colors.warning }]}>{error}</Text> : null}

        <View style={styles.composerArea}>
          <View style={[styles.composer, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about your hydration…"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.input, { color: theme.colors.textPrimary }]}
              multiline
              maxLength={ASK_SIPLY_MAX_QUESTION_LENGTH}
              editable={!unavailableReason && !sending}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => void handleSend(question)}
              disabled={!question.trim() || Boolean(unavailableReason) || sending}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: theme.colors.accent,
                  opacity: !question.trim() || unavailableReason || sending ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send question"
            >
              <MaterialIcons name="arrow-upward" size={22} color={theme.colors.surface} />
            </Pressable>
          </View>
          <Text style={[styles.disclaimer, { color: theme.colors.textSecondary }]}>AI responses can be inaccurate.</Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  screenContent: { flex: 1, minHeight: 0, paddingBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  iconButton: { padding: 4 },
  title: { fontSize: 22, fontWeight: "600" },
  list: { flex: 1, minHeight: 0 },
  listContent: { gap: 10, paddingTop: 12, paddingBottom: 18 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  emptyState: { alignItems: "center", gap: 10, paddingHorizontal: 12 },
  emptyTitle: { fontSize: 19, fontWeight: "600", textAlign: "center" },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  bubble: { maxWidth: "88%", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 5 },
  aiBubble: { alignSelf: "flex-start", borderBottomLeftRadius: 5 },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  aiLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  messageText: { fontSize: 15, lineHeight: 21 },
  continueButton: { alignSelf: "flex-start", paddingVertical: 5, paddingRight: 10 },
  continueText: { fontSize: 13, fontWeight: "700" },
  suggestions: { alignSelf: "stretch", gap: 8, marginTop: 6 },
  suggestion: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  suggestionText: { fontSize: 13, lineHeight: 18 },
  loader: { alignSelf: "flex-start", margin: 12 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 9, marginBottom: 10 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  composerArea: { flexShrink: 0 },
  composer: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderRadius: 16, padding: 6, minHeight: 52 },
  input: { flex: 1, maxHeight: 110, minHeight: 38, paddingHorizontal: 8, paddingVertical: 8, fontSize: 15 },
  sendButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 6 },
});
