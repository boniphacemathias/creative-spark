import { CampaignError } from "@/domain/campaign/errors";
import { KeyValueStorage } from "@/lib/storage/kv-storage";

export class LocalStorageKV implements KeyValueStorage {
  getItem(key: string): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      throw new CampaignError("STORAGE_READ_FAILED", `Failed to read localStorage key: ${key}`, error);
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      throw new CampaignError("STORAGE_WRITE_FAILED", `Failed to write localStorage key: ${key}`, error);
    }
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      throw new CampaignError("STORAGE_WRITE_FAILED", `Failed to remove localStorage key: ${key}`, error);
    }
  }
}
