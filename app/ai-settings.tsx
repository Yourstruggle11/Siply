import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Screen } from "../src/shared/components/Screen";
import { Card } from "../src/shared/components/Card";
import { Field } from "../src/shared/components/Field";
import { Button } from "../src/shared/components/Button";
import { ToggleRow } from "../src/shared/components/ToggleRow";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { useInternetStatus } from "../src/shared/network/NetworkStatusProvider";
import {
  AI_DISCLOSURE_VERSION,
  AI_PROVIDER_NAMES,
  AI_PROVIDER_ORDER,
  NVIDIA_DEFAULT_BASE_URL,
  NVIDIA_DEFAULT_MODEL,
} from "../src/features/hydration/ai/constants";
import {
  normalizeNvidiaBaseUrl,
  validateAiCredential,
  validateNvidiaBaseUrl,
} from "../src/features/hydration/ai/client";
import { getAiErrorCode, getAskSiplyErrorMessage } from "../src/features/hydration/ai/errors";
import { useAiSettings } from "../src/features/hydration/ai/state";
import type {
  AiProviderCredential,
  AiProviderId,
} from "../src/features/hydration/ai/types";

const providerIcons: Record<AiProviderId, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  openai: "creation-outline",
  anthropic: "alpha-a-circle-outline",
  gemini: "star-four-points-outline",
  nvidia: "memory",
};

const safeHostname = (baseUrl: string) => {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "the configured NVIDIA server";
  }
};

export default function AiSettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const internetStatus = useInternetStatus();
  const {
    hydrated,
    supported,
    preferences,
    configuredProviders,
    getCredential,
    storeCredential,
    deleteCredential,
    setActiveProvider,
    setAutomaticInsightsEnabled,
  } = useAiSettings();
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId | null>(null);
  const [existingCredential, setExistingCredential] = useState<AiProviderCredential | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(NVIDIA_DEFAULT_BASE_URL);
  const [modelId, setModelId] = useState(NVIDIA_DEFAULT_MODEL);
  const [consented, setConsented] = useState(false);
  const [loadingCredential, setLoadingCredential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProvider) return;
    let active = true;
    setLoadingCredential(true);
    setApiKey("");
    setStatus(null);
    void getCredential(selectedProvider).then((credential) => {
      if (!active) return;
      setExistingCredential(credential);
      if (credential?.provider === "nvidia") {
        setBaseUrl(credential.baseUrl);
        setModelId(credential.modelId);
      } else {
        setBaseUrl(NVIDIA_DEFAULT_BASE_URL);
        setModelId(NVIDIA_DEFAULT_MODEL);
      }
      setConsented(credential?.disclosureVersion === AI_DISCLOSURE_VERSION);
      setLoadingCredential(false);
    });
    return () => {
      active = false;
    };
  }, [getCredential, selectedProvider]);

  const consentRequired = useMemo(() => {
    if (!existingCredential || existingCredential.disclosureVersion !== AI_DISCLOSURE_VERSION) {
      return true;
    }
    if (selectedProvider === "nvidia" && existingCredential.provider === "nvidia") {
      return safeHostname(existingCredential.baseUrl) !== safeHostname(baseUrl);
    }
    return false;
  }, [baseUrl, existingCredential, selectedProvider]);

  useEffect(() => {
    if (consentRequired) setConsented(false);
  }, [consentRequired]);

  const handleBack = () => {
    if (selectedProvider) {
      setSelectedProvider(null);
      setExistingCredential(null);
      setStatus(null);
      return;
    }
    router.back();
  };

  const handleSave = async () => {
    if (!selectedProvider || saving) return;
    const key = apiKey.trim() || existingCredential?.apiKey || "";
    if (!key) {
      setStatus("Paste an API key to continue.");
      return;
    }
    if (selectedProvider === "nvidia") {
      if (!validateNvidiaBaseUrl(baseUrl)) {
        setStatus("NVIDIA Base URL must be a valid HTTPS address without credentials or query parameters.");
        return;
      }
      if (!modelId.trim()) {
        setStatus("Enter a NVIDIA Model ID.");
        return;
      }
    }
    if (consentRequired && !consented) {
      setStatus("Please confirm the privacy disclosure before connecting.");
      return;
    }
    if (internetStatus !== "online") {
      setStatus("Connect to the internet to verify this API key.");
      return;
    }

    const validatedAt = new Date().toISOString();
    const credential: AiProviderCredential =
      selectedProvider === "nvidia"
        ? {
            provider: "nvidia",
            apiKey: key,
            baseUrl: normalizeNvidiaBaseUrl(baseUrl),
            modelId: modelId.trim(),
            disclosureVersion: AI_DISCLOSURE_VERSION,
            validatedAt,
          }
        : {
            provider: selectedProvider,
            apiKey: key,
            disclosureVersion: AI_DISCLOSURE_VERSION,
            validatedAt,
          };

    setSaving(true);
    setStatus("Verifying with the provider…");
    try {
      await validateAiCredential(credential);
      await storeCredential(credential);
      setExistingCredential(credential);
      setApiKey("");
      setConsented(true);
      setStatus(`${AI_PROVIDER_NAMES[selectedProvider]} is connected and active.`);
    } catch (error) {
      setStatus(getAskSiplyErrorMessage(getAiErrorCode(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    if (!selectedProvider) return;
    const provider = selectedProvider;
    Alert.alert(
      `Remove ${AI_PROVIDER_NAMES[provider]} key?`,
      "The key will be removed from secure storage. Saved AI insights will be kept until you delete them separately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove key",
          style: "destructive",
          onPress: () => {
            void deleteCredential(provider).then(() => {
              setExistingCredential(null);
              setApiKey("");
              setStatus("API key removed. Saved AI insights were kept.");
            });
          },
        },
      ]
    );
  };

  const disclosureTarget =
    selectedProvider === "nvidia"
      ? safeHostname(baseUrl)
      : selectedProvider
        ? AI_PROVIDER_NAMES[selectedProvider]
        : "your provider";

  return (
    <Screen scroll>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.iconButton} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={28} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>AI settings</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!supported || Platform.OS === "web" ? (
          <Card style={styles.cardGap}>
            <MaterialCommunityIcons name="cellphone-lock" size={28} color={theme.colors.accent} />
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Available on iOS and Android</Text>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>Secure API-key storage is not available in Siply's web build.</Text>
          </Card>
        ) : !selectedProvider ? (
          <>
            <Text style={[styles.body, { color: theme.colors.textSecondary }]}>Connect a provider you already use. Siply does not supply or pay for AI access.</Text>
            <Card style={styles.cardGap}>
              <ToggleRow
                label="Automatic AI insights"
                helper="Optionally adds AI annotations, daily recaps, and weekly reviews in History. Off by default; failures always fall back silently."
                value={preferences.automaticInsightsEnabled}
                onValueChange={(value) => void setAutomaticInsightsEnabled(value)}
              />
            </Card>
            <View style={styles.providerList}>
              {AI_PROVIDER_ORDER.map((provider) => {
                const configured = configuredProviders.includes(provider);
                const active = preferences.activeProvider === provider;
                const needsAttention = preferences.needsAttention.includes(provider);
                return (
                  <Card key={provider} style={styles.providerCard}>
                    <Pressable
                      onPress={() => setSelectedProvider(provider)}
                      style={({ pressed }) => [styles.providerMain, { opacity: pressed ? 0.7 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Configure ${AI_PROVIDER_NAMES[provider]}`}
                    >
                      <MaterialCommunityIcons name={providerIcons[provider]} size={26} color={theme.colors.accent} />
                      <View style={styles.providerText}>
                        <Text style={[styles.providerName, { color: theme.colors.textPrimary }]}>{AI_PROVIDER_NAMES[provider]}</Text>
                        <Text style={[styles.caption, { color: needsAttention ? theme.colors.warning : theme.colors.textSecondary }]}>
                          {needsAttention ? "Key needs attention" : active ? "Active" : configured ? "Connected" : "Not connected"}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
                    </Pressable>
                    {configured && !active ? (
                      <Button label={`Use ${AI_PROVIDER_NAMES[provider]}`} variant="secondary" onPress={() => void setActiveProvider(provider)} />
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <View>
              <Text style={[styles.formTitle, { color: theme.colors.textPrimary }]}>{AI_PROVIDER_NAMES[selectedProvider]}</Text>
              <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
                {existingCredential ? "Replace the key or keep the saved one." : "Paste a key from your provider account."}
              </Text>
            </View>

            <Card style={styles.cardGap}>
              <Field
                label="API key"
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={existingCredential ? "Leave blank to keep saved key" : "Paste API key"}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loadingCredential && !saving}
              />
              {selectedProvider === "nvidia" ? (
                <>
                  <Field
                    label="Base URL"
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loadingCredential && !saving}
                  />
                  <Field
                    label="Model ID"
                    value={modelId}
                    onChangeText={setModelId}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loadingCredential && !saving}
                  />
                </>
              ) : null}
            </Card>

            <Card style={styles.cardGap}>
              <View style={styles.disclosureHeader}>
                <MaterialCommunityIcons name="shield-lock-outline" size={23} color={theme.colors.accent} />
                <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Before you connect</Text>
              </View>
              <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
                For Ask Siply, AI insights, daily recaps, and weekly reviews, Siply sends your question (when applicable), target, recent daily totals, hourly patterns, streaks, and goal statistics directly from this device to {disclosureTarget}. Siply has no AI server. Your provider's privacy terms and usage charges apply. Exact log IDs and timestamps are not sent.
              </Text>
              <Text style={[styles.body, { color: theme.colors.textSecondary }]}>Your key is stored securely on this device and is excluded from Siply backups and diagnostics. AI answers are general information, not medical advice.</Text>
              {consentRequired ? (
                <Pressable
                  onPress={() => setConsented((value) => !value)}
                  style={styles.consentRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consented }}
                >
                  <MaterialCommunityIcons
                    name={consented ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={24}
                    color={consented ? theme.colors.accent : theme.colors.textSecondary}
                  />
                  <Text style={[styles.consentText, { color: theme.colors.textPrimary }]}>I understand and agree to send this data directly to the selected provider.</Text>
                </Pressable>
              ) : null}
            </Card>

            {status ? <Text style={[styles.status, { color: theme.colors.textSecondary }]}>{status}</Text> : null}
            <Button label={saving ? "Verifying…" : "Verify, save, and use"} onPress={() => void handleSave()} disabled={saving || loadingCredential} />
            {existingCredential ? <Button label="Remove API key" variant="secondary" onPress={handleRemove} disabled={saving} /> : null}
          </>
        )}

        {!hydrated ? <Text style={[styles.caption, { color: theme.colors.textSecondary }]}>Loading AI settings…</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { padding: 4 },
  headerSpacer: { width: 36 },
  title: { fontSize: 22, fontWeight: "600" },
  formTitle: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 17 },
  cardGap: { gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  providerList: { gap: 12 },
  providerCard: { gap: 12 },
  providerMain: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  providerText: { flex: 1, gap: 3 },
  providerName: { fontSize: 16, fontWeight: "600" },
  disclosureHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  consentText: { flex: 1, fontSize: 14, lineHeight: 20 },
  status: { fontSize: 13, lineHeight: 18, textAlign: "center" },
});
