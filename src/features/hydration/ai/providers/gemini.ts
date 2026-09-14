import { AI_FIXED_MODELS } from "../constants";
import type { AiGenerateRequest, AiGenerateResult, SimpleProviderCredential } from "../types";
import { assertSuccessfulResponse, fetchWithTimeout, normalizeProviderText, readJsonObject } from "./common";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${AI_FIXED_MODELS.gemini}:generateContent`;

export const generateWithGemini = async (
  request: AiGenerateRequest & { credential: SimpleProviderCredential }
): Promise<AiGenerateResult> => {
  const response = await fetchWithTimeout(GEMINI_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": request.credential.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        maxOutputTokens: request.maxOutputTokens,
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    }),
    signal: request.signal,
  });
  assertSuccessfulResponse(response);
  const payload = (await readJsonObject(response)) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
      finishReason?: unknown;
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts
    ?.filter((part) => part.thought !== true)
    .map((part) => part.text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  const finishReason = typeof payload.candidates?.[0]?.finishReason === "string"
    ? payload.candidates[0].finishReason
    : undefined;
  return {
    text: normalizeProviderText(text),
    truncated: finishReason === "MAX_TOKENS",
    finishReason,
  };
};
