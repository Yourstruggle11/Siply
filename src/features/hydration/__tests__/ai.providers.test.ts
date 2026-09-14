import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiText, validateNvidiaBaseUrl } from "../ai/client";
import { AiProviderError } from "../ai/errors";
import type { AiProviderCredential } from "../ai/types";

const baseRequest = {
  systemPrompt: "System",
  messages: [{ role: "user" as const, content: "Hello" }],
  maxOutputTokens: 50,
};

const credential = (provider: AiProviderCredential["provider"]): AiProviderCredential => {
  const base = { provider, apiKey: "secret-key", disclosureVersion: 1, validatedAt: "2026-09-14T00:00:00.000Z" };
  return provider === "nvidia"
    ? { ...base, provider, baseUrl: "https://integrate.api.nvidia.com/v1", modelId: "custom/model" }
    : base as AiProviderCredential;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI provider adapters", () => {
  it("accepts only clean HTTPS NVIDIA base URLs", () => {
    expect(validateNvidiaBaseUrl("https://integrate.api.nvidia.com/v1")).toBe(true);
    expect(validateNvidiaBaseUrl("http://localhost:8000/v1")).toBe(false);
    expect(validateNvidiaBaseUrl("https://user:pass@example.com/v1")).toBe(false);
    expect(validateNvidiaBaseUrl("https://example.com/v1?key=secret")).toBe(false);
  });

  it("uses OpenAI Responses without server-side response storage or reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "Answer" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAiText({ ...baseRequest, credential: credential("openai") })).resolves.toMatchObject({ text: "Answer", truncated: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-key" });
    expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, reasoning: { effort: "none" } });
  });

  it("uses Anthropic Messages with thinking disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "Answer" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAiText({ ...baseRequest, credential: credential("anthropic") })).resolves.toMatchObject({ text: "Answer", truncated: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "secret-key", "anthropic-version": "2023-06-01" });
    expect(body).toMatchObject({ model: "claude-sonnet-5", thinking: { type: "disabled" } });
  });

  it("uses Gemini GenerateContent and maps assistant turns to model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Answer" }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAiText({ ...baseRequest, messages: [{ role: "assistant", content: "Prior" }], credential: credential("gemini") })).resolves.toMatchObject({ text: "Answer", truncated: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toContain("/gemini-3.5-flash-lite:generateContent");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "secret-key" });
    expect(body.contents[0]).toMatchObject({ role: "model" });
    expect(body.generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: "minimal" } });
    expect(body.generationConfig).not.toHaveProperty("temperature");
  });

  it("uses the editable NVIDIA base URL and model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Answer" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateAiText({ ...baseRequest, credential: credential("nvidia") })).resolves.toMatchObject({ text: "Answer", truncated: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(body).toMatchObject({ model: "custom/model", stream: false });
    expect(body.messages[0]).toEqual({ role: "system", content: "System" });
    expect(body).not.toHaveProperty("chat_template_kwargs");
  });

  it("disables reasoning for Siply's default NVIDIA Nemotron model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Answer", reasoning_content: "hidden" }, finish_reason: "stop" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const nvidia = credential("nvidia");
    if (nvidia.provider !== "nvidia") throw new Error("bad fixture");
    nvidia.modelId = "nvidia/nemotron-3-ultra-550b-a55b";

    await generateAiText({ ...baseRequest, credential: nvidia });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
      temperature: 1,
      top_p: 0.95,
    });
  });

  it("reports provider token-limit finishes and removes tagged reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "<think>private reasoning</think>Visible answer" }, finish_reason: "length" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAiText({ ...baseRequest, credential: credential("nvidia") })).resolves.toMatchObject({
      text: "Visible answer",
      truncated: true,
      finishReason: "length",
    });
  });

  it("normalizes each simple provider's output-limit signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: "Partial",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    }), { status: 200 })));
    await expect(generateAiText({ ...baseRequest, credential: credential("openai") }))
      .resolves.toMatchObject({ text: "Partial", truncated: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "Partial" }],
      stop_reason: "max_tokens",
    }), { status: 200 })));
    await expect(generateAiText({ ...baseRequest, credential: credential("anthropic") }))
      .resolves.toMatchObject({ text: "Partial", truncated: true });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Partial" }] }, finishReason: "MAX_TOKENS" }],
    }), { status: 200 })));
    await expect(generateAiText({ ...baseRequest, credential: credential("gemini") }))
      .resolves.toMatchObject({ text: "Partial", truncated: true });
  });

  it("normalizes authentication and rate-limit errors without exposing provider bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive details", { status: 401 })));
    await expect(generateAiText({ ...baseRequest, credential: credential("openai") })).rejects.toMatchObject<Partial<AiProviderError>>({ code: "invalid_credentials" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("quota details", { status: 429 })));
    await expect(generateAiText({ ...baseRequest, credential: credential("gemini") })).rejects.toMatchObject<Partial<AiProviderError>>({ code: "rate_limited" });
  });
});
