import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

export const useAppForeground = (onForeground: () => void) => {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appState.current === "inactive" || appState.current === "background";
      if (wasBackground && nextState === "active") {
        onForeground();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [onForeground]);
};
