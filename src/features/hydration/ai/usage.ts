import AsyncStorage from "@react-native-async-storage/async-storage";
import { AI_USAGE_STORAGE_KEY } from "./constants";

export type AiUsageBucket = "history_insight" | "daily_recap" | "weekly_review";

type AiUsageStateV1 = {
  version: 1;
  attempts: Record<string, number>;
};

const EMPTY_USAGE: AiUsageStateV1 = { version: 1, attempts: {} };
let usageQueue: Promise<void> = Promise.resolve();

const keyFor = (bucket: AiUsageBucket, periodKey: string) => `${bucket}:${periodKey}`;

const readUsage = async (): Promise<AiUsageStateV1> => {
  try {
    const raw = await AsyncStorage.getItem(AI_USAGE_STORAGE_KEY);
    if (!raw) return EMPTY_USAGE;
    const parsed = JSON.parse(raw) as Partial<AiUsageStateV1>;
    if (parsed.version !== 1 || !parsed.attempts || typeof parsed.attempts !== "object") {
      return EMPTY_USAGE;
    }
    return { version: 1, attempts: parsed.attempts };
  } catch {
    return EMPTY_USAGE;
  }
};

/** Atomically reserves one automatic request. Failed requests count toward the cap. */
export const reserveAiAttempt = (
  bucket: AiUsageBucket,
  periodKey: string,
  limit: number
): Promise<boolean> => {
  let reserved = false;
  const operation = usageQueue.catch(() => undefined).then(async () => {
    const usage = await readUsage();
    const key = keyFor(bucket, periodKey);
    const current = usage.attempts[key] ?? 0;
    if (current >= limit) return;
    const attempts = { ...usage.attempts, [key]: current + 1 };
    const recentEntries = Object.entries(attempts).slice(-120);
    await AsyncStorage.setItem(
      AI_USAGE_STORAGE_KEY,
      JSON.stringify({ version: 1, attempts: Object.fromEntries(recentEntries) })
    );
    reserved = true;
  });
  usageQueue = operation.catch(() => undefined);
  return operation.then(() => reserved).catch(() => false);
};

export const getAiAttemptCount = async (bucket: AiUsageBucket, periodKey: string) => {
  const usage = await readUsage();
  return usage.attempts[keyFor(bucket, periodKey)] ?? 0;
};
