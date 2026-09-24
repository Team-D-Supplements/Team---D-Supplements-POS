import { useQuery } from "@tanstack/react-query";
import type { ShopSettings as ShopSettingsRow } from "@/lib/types";
import { getShopSettings } from "@/lib/data";

export type ShopSettings = ShopSettingsRow;

export function useShopSettings() {
  return useQuery({
    queryKey: ["shop_settings"],
    queryFn: async (): Promise<ShopSettings | null> => getShopSettings(),
    staleTime: 60_000,
  });
}
