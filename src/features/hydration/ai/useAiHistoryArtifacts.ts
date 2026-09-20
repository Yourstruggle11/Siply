import { useEffect, useMemo, useRef, useState } from "react";
import { useInternetStatus } from "../../../shared/network/NetworkStatusProvider";
import type { HydrationState } from "../state/hydrationStore";
import { generateAiText } from "./client";
import { getAiErrorCode } from "./errors";
import {
  buildDailyRecapCandidate,
  buildWeeklyReviewCandidate,
  dismissDailyRecap,
  loadAiHistoryPresentation,
  loadAiHistoryArtifactCaches,
  makeHistoryArtifactCache,
  saveAiHistoryArtifactCache,
  subscribeAiHistoryArtifactCaches,
  subscribeAiHistoryPresentation,
  type AiHistoryArtifactCandidate,
} from "./historyArtifacts";
import { normalizeInsightOutput } from "./output";
import {
  AI_DAILY_RECAP_SYSTEM_PROMPT,
  AI_WEEKLY_REVIEW_SYSTEM_PROMPT,
} from "./prompts";
import { useAiSettings } from "./state";
import { reserveAiAttempt } from "./usage";
import type { AiHistoryArtifactCacheV1 } from "./types";

type Source = Pick<HydrationState, "settings" | "history">;

export const useAiHistoryArtifacts = (source: Source, focused: boolean) => {
  const internetStatus = useInternetStatus();
  const ai = useAiSettings();
  const [caches, setCaches] = useState<AiHistoryArtifactCacheV1[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissedDailyPeriodKey, setDismissedDailyPeriodKey] = useState<string | null>(null);
  const [presentationLoaded, setPresentationLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const attempted = useRef(new Set<string>());
  const daily = useMemo(() => buildDailyRecapCandidate(source, now), [now, source]);
  const weekly = useMemo(() => buildWeeklyReviewCandidate(source, now), [now, source]);

  useEffect(() => {
    if (!focused) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [focused]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAiHistoryArtifactCaches((next) => active && setCaches(next));
    void loadAiHistoryArtifactCaches().then((stored) => {
      if (!active) return;
      setCaches(stored);
      setLoaded(true);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAiHistoryPresentation((state) => {
      if (active) setDismissedDailyPeriodKey(state.dismissedDailyPeriodKey);
    });
    void loadAiHistoryPresentation().then((state) => {
      if (!active) return;
      setDismissedDailyPeriodKey(state.dismissedDailyPeriodKey);
      setPresentationLoaded(true);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (
      !loaded ||
      !presentationLoaded ||
      !focused ||
      !ai.hydrated ||
      !ai.preferences.automaticInsightsEnabled
    ) return;
    if (internetStatus !== "online" || !ai.preferences.activeProvider) return;
    const provider = ai.preferences.activeProvider;
    if (!ai.configuredProviders.includes(provider) || ai.preferences.needsAttention.includes(provider)) return;
    const visibleDaily = daily?.periodKey === dismissedDailyPeriodKey ? null : daily;
    const candidates = [visibleDaily, weekly].filter(
      (candidate): candidate is AiHistoryArtifactCandidate => Boolean(candidate)
    );
    const stale = candidates.filter((candidate) => !caches.some((cache) =>
      cache.kind === candidate.kind &&
      cache.periodKey === candidate.periodKey &&
      cache.contextFingerprint === candidate.contextFingerprint
    ));
    if (!stale.length) return;
    let active = true;
    const controller = new AbortController();

    void ai.getCredential(provider).then(async (credential) => {
      if (!active || !credential) return;
      for (const candidate of stale) {
        if (!active) return;
        const signature = `${candidate.kind}:${candidate.periodKey}:${candidate.contextFingerprint}`;
        if (attempted.current.has(signature)) continue;
        attempted.current.add(signature);
        const bucket = candidate.kind;
        const reserved = await reserveAiAttempt(bucket, candidate.periodKey, 1);
        if (!reserved) continue;
        try {
          const result = await generateAiText({
            credential,
            systemPrompt: candidate.kind === "daily_recap"
              ? AI_DAILY_RECAP_SYSTEM_PROMPT
              : AI_WEEKLY_REVIEW_SYSTEM_PROMPT,
            messages: [{ role: "user", content: JSON.stringify(candidate.context) }],
            maxOutputTokens: candidate.kind === "daily_recap" ? 260 : 360,
            signal: controller.signal,
          });
          if (result.truncated) continue;
          const text = normalizeInsightOutput(
            result.text,
            candidate.kind === "daily_recap" ? 70 : 100
          );
          if (!text) continue;
          await saveAiHistoryArtifactCache(makeHistoryArtifactCache(candidate, text));
        } catch (error) {
          if (controller.signal.aborted) return;
          if (getAiErrorCode(error) === "invalid_credentials") {
            await ai.markProviderNeedsAttention(provider);
            return;
          }
        }
      }
    });

    return () => { active = false; controller.abort(); };
  }, [
    ai,
    daily,
    dismissedDailyPeriodKey,
    focused,
    internetStatus,
    loaded,
    presentationLoaded,
    weekly,
  ]);

  const resolve = (candidate: AiHistoryArtifactCandidate | null) => {
    if (!ai.preferences.automaticInsightsEnabled || !candidate) return null;
    const cache = caches.find((item) =>
      item.kind === candidate.kind &&
      item.periodKey === candidate.periodKey &&
      item.contextFingerprint === candidate.contextFingerprint
    );
    return { ...candidate, aiText: cache?.text ?? null };
  };

  const resolvedDaily = !presentationLoaded || daily?.periodKey === dismissedDailyPeriodKey
    ? null
    : resolve(daily);

  return {
    daily: resolvedDaily,
    weekly: resolve(weekly),
    dismissDaily: async () => {
      if (daily) await dismissDailyRecap(daily.periodKey);
    },
  };
};
