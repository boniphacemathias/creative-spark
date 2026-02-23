import { useEffect, useMemo, useState } from "react";
import {
  listFavoriteCampaignIds,
  setCampaignFavorite,
  subscribeCampaignFavorites,
  toggleCampaignFavorite,
} from "@/lib/campaign-favorites";

export function useCampaignFavorites(scopeKey = "default") {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => listFavoriteCampaignIds());

  useEffect(() => {
    const refresh = () => setFavoriteIds(listFavoriteCampaignIds());
    refresh();
    return subscribeCampaignFavorites(refresh);
  }, [scopeKey]);

  const favoritesSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const isFavorite = (campaignId: string) => favoritesSet.has(campaignId);

  const toggleFavorite = (campaignId: string) => {
    const result = toggleCampaignFavorite(campaignId);
    setFavoriteIds(result.favorites);
    return result.isFavorite;
  };

  const setFavorite = (campaignId: string, shouldBeFavorite: boolean) => {
    const next = setCampaignFavorite(campaignId, shouldBeFavorite);
    setFavoriteIds(next);
  };

  return {
    favoriteIds,
    favoritesSet,
    isFavorite,
    toggleFavorite,
    setFavorite,
  };
}
