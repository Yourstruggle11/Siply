import { AI_REQUEST_TIMEOUT_MS } from "../constants";
import { AiProviderError } from "../errors";

export const assertSuccessfulResponse = (response: Response) => {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new AiProviderError("invalid_credentials");
  }
  if (response.status === 429) throw new AiProviderError("rate_limited");
  if (response.status === 404) throw new AiProviderError("model_unavailable");
  throw new AiProviderError("provider_unavailable");
};

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = AI_REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      if (externalSignal?.aborted) throw error;
      throw new AiProviderError("timeout");
    }
    throw new AiProviderError("provider_unavailable");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
};

export const requireText = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AiProviderError("invalid_response");
  }
  return value.trim();
};

export const normalizeProviderText = (value: unknown) => {
  const text = requireText(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
  return requireText(text);
};

export const readJsonObject = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not_an_object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new AiProviderError("invalid_response");
  }
};
