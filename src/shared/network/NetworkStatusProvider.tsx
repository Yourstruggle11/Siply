import React, { createContext, useContext, useMemo } from "react";
import { useNetworkState } from "expo-network";

export type InternetStatus = "checking" | "online" | "offline";

const InternetStatusContext = createContext<InternetStatus>("checking");

export const deriveInternetStatus = (state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): InternetStatus => {
  const connected = state.isConnected;
  const reachable = state.isInternetReachable;
  if (connected === false || reachable === false) {
    return "offline";
  }
  if (connected === true && reachable === true) {
    return "online";
  }
  return "checking";
};

export const NetworkStatusProvider = ({ children }: { children: React.ReactNode }) => {
  const networkState = useNetworkState();
  const status = useMemo(
    () => deriveInternetStatus(networkState),
    [networkState.isConnected, networkState.isInternetReachable]
  );

  return (
    <InternetStatusContext.Provider value={status}>
      {children}
    </InternetStatusContext.Provider>
  );
};

export const useInternetStatus = () => useContext(InternetStatusContext);
