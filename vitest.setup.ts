import { vi } from "vitest";

// React Native publishes Flow syntax that Vitest's default Node transform does
// not parse. These unit tests only need the platform branch and Alert API, so
// provide their runtime boundary centrally instead of loading native source.
vi.mock("react-native", () => ({
  Alert: {
    alert: vi.fn(),
  },
  Platform: {
    OS: "ios",
    Version: 17,
    select: (values: Record<string, unknown>) => values.ios ?? values.default,
  },
}));
