import { getActiveWorkspaceId } from "@/lib/workspace";

const FAVORITES_STORAGE_KEY_PREFIX = "creative-spark-campaign-favorites";
const FAVORITES_CHANGE_EVENT = "creative-spark-campaign-favorites-change";

function getFavoritesStorageKey() {
  return `${FAVORITES_STORAGE_KEY_PREFIX}:${getActiveWorkspaceId()}`;
}

function readFavorites(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getFavoritesStorageKey());
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, 100);
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getFavoritesStorageKey(), JSON.stringify(ids.slice(0, 100)));
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT));
}

export function listFavoriteCampaignIds(): string[] {
  return readFavorites();
}

export function isCampaignFavorite(id: string): boolean {
  return readFavorites().includes(id);
}

export function setCampaignFavorite(id: string, shouldBeFavorite: boolean): string[] {
  const targetId = String(id || "").trim();
  if (!targetId) {
    return readFavorites();
  }

  const current = readFavorites();
  const next = shouldBeFavorite
    ? Array.from(new Set([targetId, ...current]))
    : current.filter((entry) => entry !== targetId);
  writeFavorites(next);
  return next;
}

export function toggleCampaignFavorite(id: string): { isFavorite: boolean; favorites: string[] } {
  const currentlyFavorite = isCampaignFavorite(id);
  const favorites = setCampaignFavorite(id, !currentlyFavorite);
  return {
    isFavorite: !currentlyFavorite,
    favorites,
  };
}

export function subscribeCampaignFavorites(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== getFavoritesStorageKey()) {
      return;
    }
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(FAVORITES_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FAVORITES_CHANGE_EVENT, listener);
  };
}
