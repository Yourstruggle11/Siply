import AsyncStorage from "@react-native-async-storage/async-storage";

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
