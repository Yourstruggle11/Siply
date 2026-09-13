import { useEffect, useRef } from "react";

const MIDNIGHT_SETTLE_MS = 50;

export const getMillisecondsUntilNextLocalDay = (now: Date): number => {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, MIDNIGHT_SETTLE_MS);
  return Math.max(1, nextDay.getTime() - now.getTime());
};

/**
 * Runs a callback just after each local midnight while the JavaScript runtime
 * remains active. App-resume handling remains the fallback when the OS has
 * suspended the process.
 */
export const useDayRollover = (onRollover: () => void | Promise<unknown>) => {
  const callbackRef = useRef(onRollover);
  callbackRef.current = onRollover;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(() => {
        Promise.resolve(callbackRef.current())
          .catch((error) => {
            console.warn("Siply: failed to refresh the day at midnight", error);
          })
          .finally(() => {
            if (active) {
              schedule();
            }
          });
      }, getMillisecondsUntilNextLocalDay(new Date()));
    };

    schedule();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);
};
