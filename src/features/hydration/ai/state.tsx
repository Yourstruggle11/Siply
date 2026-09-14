import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getAiCredential,
  isSecureAiStorageSupported,
  listConfiguredAiProviders,
  removeAiCredential,
  saveAiCredential,
} from "./credentials";
import { DEFAULT_AI_PREFERENCES } from "./constants";
import { loadAiPreferences, saveAiPreferences } from "./preferences";
import type { AiPreferences, AiProviderCredential, AiProviderId } from "./types";

type AiSettingsContextValue = {
  hydrated: boolean;
  supported: boolean;
  preferences: AiPreferences;
  configuredProviders: AiProviderId[];
  getCredential: (provider: AiProviderId) => Promise<AiProviderCredential | null>;
  storeCredential: (credential: AiProviderCredential) => Promise<void>;
  deleteCredential: (provider: AiProviderId) => Promise<void>;
  setActiveProvider: (provider: AiProviderId | null) => Promise<void>;
  setAutomaticInsightsEnabled: (enabled: boolean) => Promise<void>;
  markProviderNeedsAttention: (provider: AiProviderId) => Promise<void>;
};

const AiSettingsContext = createContext<AiSettingsContextValue | null>(null);

export const AiSettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [hydrated, setHydrated] = useState(false);
  const [preferences, setPreferences] = useState<AiPreferences>(DEFAULT_AI_PREFERENCES);
  const preferencesRef = useRef<AiPreferences>(DEFAULT_AI_PREFERENCES);
  const [configuredProviders, setConfiguredProviders] = useState<AiProviderId[]>([]);
  const supported = isSecureAiStorageSupported();

  useEffect(() => {
    let active = true;
    void Promise.all([loadAiPreferences(), listConfiguredAiProviders()]).then(
      ([storedPreferences, configured]) => {
        if (!active) return;
        preferencesRef.current = storedPreferences;
        setPreferences(storedPreferences);
        setConfiguredProviders(configured);
        setHydrated(true);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const commitPreferences = useCallback(async (
    update: (current: AiPreferences) => AiPreferences
  ) => {
    const next = update(preferencesRef.current);
    preferencesRef.current = next;
    setPreferences(next);
    await saveAiPreferences(next);
  }, []);

  const storeCredential = useCallback(
    async (credential: AiProviderCredential) => {
      await saveAiCredential(credential);
      setConfiguredProviders((current) =>
        current.includes(credential.provider) ? current : [...current, credential.provider]
      );
      await commitPreferences((current) => ({
        ...current,
        activeProvider: credential.provider,
        needsAttention: current.needsAttention.filter((item) => item !== credential.provider),
        configRevision: current.configRevision + 1,
      }));
    },
    [commitPreferences]
  );

  const deleteCredential = useCallback(
    async (provider: AiProviderId) => {
      await removeAiCredential(provider);
      setConfiguredProviders((current) => current.filter((item) => item !== provider));
      await commitPreferences((current) => ({
        ...current,
        activeProvider: current.activeProvider === provider ? null : current.activeProvider,
        needsAttention: current.needsAttention.filter((item) => item !== provider),
        configRevision: current.configRevision + 1,
      }));
    },
    [commitPreferences]
  );

  const setActiveProvider = useCallback(
    async (provider: AiProviderId | null) => {
      await commitPreferences((current) => ({
        ...current,
        activeProvider: provider,
        configRevision: current.configRevision + 1,
      }));
    },
    [commitPreferences]
  );

  const setAutomaticInsightsEnabled = useCallback(
    async (enabled: boolean) => {
      await commitPreferences((current) => ({ ...current, automaticInsightsEnabled: enabled }));
    },
    [commitPreferences]
  );

  const markProviderNeedsAttention = useCallback(
    async (provider: AiProviderId) => {
      if (preferencesRef.current.needsAttention.includes(provider)) return;
      await commitPreferences((current) => ({
        ...current,
        needsAttention: [...current.needsAttention, provider],
      }));
    },
    [commitPreferences]
  );

  const value = useMemo<AiSettingsContextValue>(
    () => ({
      hydrated,
      supported,
      preferences,
      configuredProviders,
      getCredential: getAiCredential,
      storeCredential,
      deleteCredential,
      setActiveProvider,
      setAutomaticInsightsEnabled,
      markProviderNeedsAttention,
    }),
    [
      configuredProviders,
      deleteCredential,
      hydrated,
      markProviderNeedsAttention,
      preferences,
      setActiveProvider,
      setAutomaticInsightsEnabled,
      storeCredential,
      supported,
    ]
  );

  return <AiSettingsContext.Provider value={value}>{children}</AiSettingsContext.Provider>;
};

export const useAiSettings = () => {
  const value = useContext(AiSettingsContext);
  if (!value) throw new Error("useAiSettings must be used within AiSettingsProvider");
  return value;
};
