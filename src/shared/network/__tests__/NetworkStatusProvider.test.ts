import { describe, expect, it, vi } from "vitest";

vi.mock("expo-network", () => ({
  useNetworkState: () => ({}),
}));

import { deriveInternetStatus } from "../NetworkStatusProvider";

describe("deriveInternetStatus", () => {
  it("distinguishes initial, reachable, and offline states", () => {
    expect(deriveInternetStatus({})).toBe("checking");
    expect(deriveInternetStatus({ isConnected: true, isInternetReachable: null })).toBe("checking");
    expect(deriveInternetStatus({ isConnected: true, isInternetReachable: true })).toBe("online");
    expect(deriveInternetStatus({ isConnected: true, isInternetReachable: false })).toBe("offline");
    expect(deriveInternetStatus({ isConnected: false })).toBe("offline");
  });
});
