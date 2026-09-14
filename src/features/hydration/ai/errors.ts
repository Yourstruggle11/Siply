export type AiErrorCode =
  | "offline"
  | "timeout"
  | "invalid_credentials"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable"
  | "invalid_response";

export class AiProviderError extends Error {
  constructor(public readonly code: AiErrorCode) {
    super(code);
    this.name = "AiProviderError";
  }
}

export const getAiErrorCode = (error: unknown): AiErrorCode =>
  error instanceof AiProviderError ? error.code : "provider_unavailable";

export const getAskSiplyErrorMessage = (code: AiErrorCode) => {
  switch (code) {
    case "offline":
      return "You're offline. Ask Siply will be ready when your connection returns.";
    case "invalid_credentials":
      return "That API key was rejected. Check it in AI settings and try again.";
    case "rate_limited":
      return "Your provider is busy or the key has reached its limit. Try again later.";
    case "model_unavailable":
      return "The configured model is unavailable. Check your AI settings.";
    case "timeout":
      return "The provider took too long to respond. Please try again.";
    case "invalid_response":
      return "The provider returned an unreadable response. Please try again.";
    default:
      return "Ask Siply couldn't reach your provider. Your hydration data is unchanged.";
  }
};
