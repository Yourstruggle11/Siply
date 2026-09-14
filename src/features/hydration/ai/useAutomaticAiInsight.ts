import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDateKey } from "../../../core/time";
import { useInternetStatus } from "../../../shared/network/NetworkStatusProvider";
import {
  generateAiText,
  getCredentialModel,
  getProviderConfigFingerprintSource,
} from "./client";
import {
  AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT,
  AI_INSIGHT_PROMPT_VERSION,
} from "./constants";
import { fingerprintAiContext, fingerprintAiTrendContext } from "./context";
import { getAiErrorCode } from "./errors";
import {
  fingerprintValue,
  loadAiInsightCache,
  saveAiInsightCache,
  shouldDisplayAiInsight,
  shouldFetchAiInsight,
  subscribeAiInsightCache,
} from "./insightCache";
import { normalizeInsightOutput } from "./output";
import { AI_INSIGHT_SYSTEM_PROMPT, buildInsightMessages } from "./prompts";
import { useAiSettings } from "./state";
import { getAiAttemptCount, reserveAiAttempt } from "./usage";
import type { AiHydrationContextV1, AiInsightCacheV1 } from "./types";

export const useAutomaticAiInsight = (
  context: AiHydrationContextV1,
  deterministicInsight: string | null,
  focused: boolean
) => {
  const internetStatus = useInternetStatus();
  const {
    hydrated,
    preferences,
    configuredProviders,
    getCredential,
    markProviderNeedsAttention,
  } = useAiSettings();
  const [cache, setCache] = useState<AiInsightCacheV1 | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [automaticAttempts, setAutomaticAttempts] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const attemptedSignature = useRef<string | null>(null);
  const contextFingerprint = useMemo(() => fingerprintAiContext(context), [context]);
  const trendFingerprint = useMemo(() => fingerprintAiTrendContext(context), [context]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAiInsightCache((nextCache) => {
      if (active) setCache(nextCache);
    });
    void Promise.all([
      loadAiInsightCache(),
      getAiAttemptCount("history_insight", context.localDate),
    ]).then(([stored, attempts]) => {
      if (!active) return;
      setCache(stored);
      setAutomaticAttempts(attempts);
      setCacheLoaded(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [context.localDate]);

  useEffect(() => {
    if (!focused) attemptedSignature.current = null;
  }, [focused]);

  const runGeneration = useCallback(async (manual: boolean, signal?: AbortSignal) => {
    const provider = preferences.activeProvider;
    if (!provider || !configuredProviders.includes(provider)) return false;
    if (preferences.needsAttention.includes(provider) || internetStatus !== "online") return false;
    const credential = await getCredential(provider);
    if (!credential) return false;
    const providerConfigFingerprint = fingerprintValue({
      ...getProviderConfigFingerprintSource(credential),
      revision: preferences.configRevision,
    });
    if (!manual) {
      const reserved = await reserveAiAttempt(
        "history_insight",
        context.localDate,
        AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT
      );
      if (!reserved) {
        setAutomaticAttempts(AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT);
        return false;
      }
      setAutomaticAttempts((count) => count + 1);
    }

    setRefreshing(true);
    try {
      const result = await generateAiText({
        credential,
        systemPrompt: AI_INSIGHT_SYSTEM_PROMPT,
        messages: buildInsightMessages(context),
        maxOutputTokens: 220,
        signal,
      });
      if (result.truncated) return false;
      const text = normalizeInsightOutput(result.text, 55);
      if (!text) return false;
      const now = new Date();
      const nextCache: AiInsightCacheV1 = {
        version: 1,
        promptVersion: AI_INSIGHT_PROMPT_VERSION,
        text,
        provider,
        model: getCredentialModel(credential),
        generatedAt: now.toISOString(),
        localDate: getDateKey(now),
        dataThroughDate: context.localDate,
        contextFingerprint,
        providerConfigFingerprint,
        sourceConsumedMl: context.today.consumedMl,
        sourceTargetMl: context.settings.dailyTargetMl,
        sourceTargetMet: context.today.consumedMl >= context.settings.dailyTargetMl,
        trendFingerprint,
      };
      await saveAiInsightCache(nextCache);
      setCache(nextCache);
      return true;
    } catch (error) {
      if (!signal?.aborted && getAiErrorCode(error) === "invalid_credentials") {
        await markProviderNeedsAttention(provider);
      }
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [
    configuredProviders,
    context,
    contextFingerprint,
    getCredential,
    internetStatus,
    markProviderNeedsAttention,
    preferences.activeProvider,
    preferences.configRevision,
    preferences.needsAttention,
    trendFingerprint,
  ]);

  useEffect(() => {
    const provider = preferences.activeProvider;
    if (!hydrated || !cacheLoaded || !provider || !deterministicInsight) return;
    if (!configuredProviders.includes(provider) || preferences.needsAttention.includes(provider)) return;
    if (internetStatus !== "online" || !preferences.automaticInsightsEnabled || !focused) return;
    let active = true;
    const controller = new AbortController();

    void getCredential(provider).then(async (credential) => {
      if (!active || !credential) return;
      const providerConfigFingerprint = fingerprintValue({
        ...getProviderConfigFingerprintSource(credential),
        revision: preferences.configRevision,
      });
      const shouldFetch = shouldFetchAiInsight({
        enabled: true,
        focused,
        hasLocalInsight: true,
        hasCredential: true,
        online: true,
        localDate: context.localDate,
        contextFingerprint,
        providerConfigFingerprint,
        trendFingerprint,
        consumedMl: context.today.consumedMl,
        targetMl: context.settings.dailyTargetMl,
        automaticAttempts,
        nowMs: Date.now(),
        cache,
      });
      if (!shouldFetch) return;
      const signature = [
        context.localDate,
        providerConfigFingerprint,
        contextFingerprint,
      ].join(":");
      if (attemptedSignature.current === signature) return;
      attemptedSignature.current = signature;
      await runGeneration(false, controller.signal);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    automaticAttempts,
    cache,
    cacheLoaded,
    configuredProviders,
    context,
    contextFingerprint,
    deterministicInsight,
    focused,
    getCredential,
    hydrated,
    internetStatus,
    preferences.activeProvider,
    preferences.automaticInsightsEnabled,
    preferences.configRevision,
    preferences.needsAttention,
    runGeneration,
    trendFingerprint,
  ]);

  const text = shouldDisplayAiInsight(
    preferences.automaticInsightsEnabled,
    contextFingerprint,
    cache
  ) ? cache?.text ?? null : null;
  const activeProvider = preferences.activeProvider;
  const canManualRefresh = Boolean(
    focused &&
    preferences.automaticInsightsEnabled &&
    internetStatus === "online" &&
    activeProvider &&
    configuredProviders.includes(activeProvider) &&
    !preferences.needsAttention.includes(activeProvider) &&
    automaticAttempts >= AI_HISTORY_DAILY_AUTOMATIC_ATTEMPT_LIMIT &&
    !text
  );

  return {
    text,
    refreshing,
    canManualRefresh,
    refreshManually: () => runGeneration(true),
  };
};
