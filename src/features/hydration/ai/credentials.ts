import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { AI_PROVIDER_ORDER } from "./constants";
import type { AiProviderCredential, AiProviderId } from "./types";

const credentialKey = (provider: AiProviderId) =>
  `siply.ai.credentials.${provider}.v1`;

export const isSecureAiStorageSupported = () => Platform.OS !== "web";

const isCredential = (
  value: unknown,
  expectedProvider: AiProviderId
): value is AiProviderCredential => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiProviderCredential>;
  if (
    item.provider !== expectedProvider ||
    typeof item.apiKey !== "string" ||
    item.apiKey.trim().length === 0 ||
    typeof item.validatedAt !== "string" ||
    typeof item.disclosureVersion !== "number"
  ) {
    return false;
  }
  if (expectedProvider === "nvidia") {
    const nvidia = item as Partial<Extract<AiProviderCredential, { provider: "nvidia" }>>;
    return typeof nvidia.baseUrl === "string" && typeof nvidia.modelId === "string";
  }
  return true;
};

export const getAiCredential = async (
  provider: AiProviderId
): Promise<AiProviderCredential | null> => {
  if (!isSecureAiStorageSupported()) return null;
  try {
    const raw = await SecureStore.getItemAsync(credentialKey(provider));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCredential(parsed, provider) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveAiCredential = async (credential: AiProviderCredential) => {
  if (!isSecureAiStorageSupported()) {
    throw new Error("secure_storage_unavailable");
  }
  await SecureStore.setItemAsync(credentialKey(credential.provider), JSON.stringify(credential), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const removeAiCredential = async (provider: AiProviderId) => {
  if (!isSecureAiStorageSupported()) return;
  await SecureStore.deleteItemAsync(credentialKey(provider));
};

export const listConfiguredAiProviders = async (): Promise<AiProviderId[]> => {
  if (!isSecureAiStorageSupported()) return [];
  const records = await Promise.all(
    AI_PROVIDER_ORDER.map(async (provider) => ({
      provider,
      credential: await getAiCredential(provider),
    }))
  );
  return records.filter((item) => item.credential !== null).map((item) => item.provider);
};
