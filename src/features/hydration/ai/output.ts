const META_LANGUAGE = [
  /\bthe user (?:wants|asks|has)\b/i,
  /\bi need to (?:write|answer|respond|provide)\b/i,
  /\b(?:system|developer) prompt\b/i,
  /\blooking at the data\b/i,
  /\bmy (?:task|response|answer)\b/i,
];

export const normalizeInsightOutput = (value: string, maxWords: number) => {
  const text = value
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text || text === "NO_ADDITIONAL_INSIGHT") return null;
  if (META_LANGUAGE.some((pattern) => pattern.test(text))) return null;
  if (text.split(/\s+/).length > maxWords) return null;
  return text;
};
