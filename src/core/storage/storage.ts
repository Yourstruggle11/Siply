import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "./keys";

export const getJson = async <T>(key: string): Promise<T | null> => {
  const value = await AsyncStorage.getItem(key);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const setJson = async <T>(key: string, value: T) => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};

export const removeKey = async (key: string) => {
  await AsyncStorage.removeItem(key);
};

export const ensureFirstLaunchAt = async (now = new Date()): Promise<string> => {
  const existing = await getJson<string>(STORAGE_KEYS.firstLaunchAt);
  if (existing && Number.isFinite(new Date(existing).getTime())) {
    return existing;
  }

  const firstLaunchAt = now.toISOString();
  await setJson(STORAGE_KEYS.firstLaunchAt, firstLaunchAt);
  return firstLaunchAt;
};
