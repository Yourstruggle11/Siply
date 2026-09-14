import { AI_FIXED_MODELS } from "../constants";
import type { AiGenerateRequest, AiGenerateResult, SimpleProviderCredential } from "../types";
import { assertSuccessfulResponse, fetchWithTimeout, normalizeProviderText, readJsonObject } from "./common";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export const generateWithAnthropic = async (
  request: AiGenerateRequest & { credential: SimpleProviderCredential }
): Promise<AiGenerateResult> => {
  const response = await fetchWithTimeout(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": request.credential.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_FIXED_MODELS.anthropic,
      system: request.systemPrompt,
      messages: request.messages,
      max_tokens: request.maxOutputTokens,
      thinking: { type: "disabled" },
    }),
    signal: request.signal,
  });
  assertSuccessfulResponse(response);
  const payload = (await readJsonObject(response)) as {
    content?: Array<{ type?: string; text?: unknown }>;
    stop_reason?: unknown;
  };
  const text = payload.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  const finishReason = typeof payload.stop_reason === "string" ? payload.stop_reason : undefined;
  return {
    text: normalizeProviderText(text),
    truncated: finishReason === "max_tokens",
    finishReason,
  };
};
