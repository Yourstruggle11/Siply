import * as FileSystem from "expo-file-system/legacy";
import { processBackupUri } from "./import";

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export const handleIncomingBackupUrl = async (
  url: string | null,
  delayMs = 0
): Promise<boolean> => {
  if (!url) {
    return false;
  }

  const isNamedBackup = url.toLowerCase().includes(".siply.json");
  const isLocalFile = url.startsWith("file://") || url.startsWith("content://");
  if (!isNamedBackup && !isLocalFile) {
    return false;
  }

  let safeUri = url;
  if (url.startsWith("content://")) {
    try {
      safeUri = `${FileSystem.cacheDirectory}incoming-backup.siply.json`;
      await FileSystem.copyAsync({ from: url, to: safeUri });
    } catch {
      return false;
    }
  }

  if (delayMs > 0) {
    await wait(delayMs);
  }

  await processBackupUri(safeUri, { silentInvalid: !isNamedBackup });
  return true;
};
