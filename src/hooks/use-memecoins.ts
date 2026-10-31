import { useQuery } from "@tanstack/react-query";
import { fetchMemecoins, fetchPrices, type Token } from "@/lib/memecoins";

export function useMemecoins() {
  return useQuery({ queryKey: ["memecoins"], queryFn: fetchMemecoins, refetchInterval: 15000, staleTime: 10000 });
}

/** Live prices for tokens a player holds that may not be in the trending list. */
export function useHeldPrices(addresses: string[], list: Token[] | undefined) {
  const missing = addresses.filter((a) => !list?.some((t) => t.address === a)).sort();
  const q = useQuery({
    queryKey: ["prices", missing.join(",")],
    queryFn: () => fetchPrices(missing),
    enabled: missing.length > 0,
    refetchInterval: 15000,
  });
  const map = new Map<string, Token>();
  for (const t of list ?? []) map.set(t.address, t);
  for (const t of q.data ?? []) map.set(t.address, t);
  return map;
}
