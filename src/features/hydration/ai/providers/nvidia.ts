import { NVIDIA_DEFAULT_MODEL } from "../constants";
import type { AiGenerateRequest, AiGenerateResult, NvidiaCredential } from "../types";
import { assertSuccessfulResponse, fetchWithTimeout, normalizeProviderText, readJsonObject } from "./common";

const chatCompletionsUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

export const generateWithNvidia = async (
  request: AiGenerateRequest & { credential: NvidiaCredential }
): Promise<AiGenerateResult> => {
  const isDefaultNemotron = request.credential.modelId.trim() === NVIDIA_DEFAULT_MODEL;
  const response = await fetchWithTimeout(chatCompletionsUrl(request.credential.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.credential.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.credential.modelId,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages,
      ],
      max_tokens: request.maxOutputTokens,
      ...(isDefaultNemotron
        ? {
            temperature: 1,
            top_p: 0.95,
            chat_template_kwargs: { enable_thinking: false },
          }
        : {}),
      stream: false,
    }),
    signal: request.signal,
  });
  assertSuccessfulResponse(response);
  const payload = (await readJsonObject(response)) as {
    choices?: Array<{
      message?: { content?: unknown; reasoning_content?: unknown };
      finish_reason?: unknown;
    }>;
  };
  const finishReason = typeof payload.choices?.[0]?.finish_reason === "string"
    ? payload.choices[0].finish_reason
    : undefined;
  return {
    text: normalizeProviderText(payload.choices?.[0]?.message?.content),
    truncated: finishReason === "length",
    finishReason,
  };
};
