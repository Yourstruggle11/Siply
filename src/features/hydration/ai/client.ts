import { AI_FIXED_MODELS, AI_VALIDATION_TIMEOUT_MS } from "./constants";
import { AiProviderError } from "./errors";
import { generateWithAnthropic } from "./providers/anthropic";
import { generateWithGemini } from "./providers/gemini";
import { generateWithNvidia } from "./providers/nvidia";
import { generateWithOpenAi } from "./providers/openai";
import type { AiGenerateRequest, AiGenerateResult, AiProviderCredential } from "./types";

export const getCredentialModel = (credential: AiProviderCredential) =>
  credential.provider === "nvidia"
    ? credential.modelId
    : AI_FIXED_MODELS[credential.provider];

export const getProviderConfigFingerprintSource = (credential: AiProviderCredential) =>
  credential.provider === "nvidia"
    ? { provider: credential.provider, baseUrl: credential.baseUrl, model: credential.modelId }
    : { provider: credential.provider, model: AI_FIXED_MODELS[credential.provider] };

export const generateAiText = async (request: AiGenerateRequest): Promise<AiGenerateResult> => {
  switch (request.credential.provider) {
    case "openai":
      return generateWithOpenAi({ ...request, credential: request.credential });
    case "anthropic":
      return generateWithAnthropic({ ...request, credential: request.credential });
    case "gemini":
      return generateWithGemini({ ...request, credential: request.credential });
    case "nvidia":
      return generateWithNvidia({ ...request, credential: request.credential });
  }
};

export const validateAiCredential = async (credential: AiProviderCredential) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_VALIDATION_TIMEOUT_MS);
  try {
    const result = await generateAiText({
      credential,
      systemPrompt: "This is an API credential check. Follow the user's instruction exactly.",
      messages: [{ role: "user", content: "Reply exactly OK" }],
      maxOutputTokens: 16,
      signal: controller.signal,
    });
    if (result.truncated || result.text.trim().toUpperCase() !== "OK") {
      throw new AiProviderError("invalid_response");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new AiProviderError("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const normalizeNvidiaBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

export const validateNvidiaBaseUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};
