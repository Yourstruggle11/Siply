import { AI_FIXED_MODELS } from "../constants";
import type { AiGenerateRequest, AiGenerateResult, SimpleProviderCredential } from "../types";
import { assertSuccessfulResponse, fetchWithTimeout, normalizeProviderText, readJsonObject } from "./common";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const generateWithOpenAi = async (
  request: AiGenerateRequest & { credential: SimpleProviderCredential }
): Promise<AiGenerateResult> => {
  const response = await fetchWithTimeout(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.credential.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_FIXED_MODELS.openai,
      instructions: request.systemPrompt,
      input: request.messages,
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
      store: false,
    }),
    signal: request.signal,
  });
  assertSuccessfulResponse(response);
  const payload = (await readJsonObject(response)) as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
    status?: unknown;
    incomplete_details?: { reason?: unknown };
  };
  const finishReason = typeof payload.incomplete_details?.reason === "string"
    ? payload.incomplete_details.reason
    : typeof payload.status === "string" ? payload.status : undefined;
  const truncated = payload.status === "incomplete" || finishReason === "max_output_tokens";
  if (typeof payload.output_text === "string") {
    return { text: normalizeProviderText(payload.output_text), truncated, finishReason };
  }
  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  return { text: normalizeProviderText(text), truncated, finishReason };
};
