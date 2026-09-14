import { beforeEach, describe, expect, it, vi } from "vitest";

const { secureValues, getItemAsync, setItemAsync, deleteItemAsync } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    secureValues: values,
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
  };
});

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
}));

import { getAiCredential, listConfiguredAiProviders, removeAiCredential, saveAiCredential } from "../ai/credentials";
import { AI_INSIGHT_CACHE_STORAGE_KEY } from "../ai/constants";

beforeEach(() => {
  secureValues.clear();
  vi.clearAllMocks();
});

describe("AI credential storage", () => {
  it("stores one structured secure record per provider", async () => {
    await saveAiCredential({
      provider: "nvidia",
      apiKey: "nv-key",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      modelId: "nvidia/model",
      disclosureVersion: 1,
      validatedAt: "2026-09-14T00:00:00.000Z",
    });
    await expect(getAiCredential("nvidia")).resolves.toMatchObject({ provider: "nvidia", apiKey: "nv-key", modelId: "nvidia/model" });
    await expect(listConfiguredAiProviders()).resolves.toEqual(["nvidia"]);
  });

  it("removing a key only deletes its secure record, never the insight cache", async () => {
    await removeAiCredential("openai");
    expect(deleteItemAsync).toHaveBeenCalledOnce();
    expect(deleteItemAsync.mock.calls[0][0]).not.toBe(AI_INSIGHT_CACHE_STORAGE_KEY);
  });
});
