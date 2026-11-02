// Real memecoin data from DexScreener (Solana, incl. pump.fun launches).
export const CORE_TOKENS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump", // FARTCOIN
  "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump", // PNUT
  "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY", // MOODENG
  "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump", // GOAT
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN", // TRUMP
];

export type Token = {
  address: string;
  pair: string;
  symbol: string;
  name: string;
  price: number;
  change5m: number;
  change1h: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  icon?: string;
  pumpfun: boolean;
  trending: boolean;
  pairCreatedAt?: number;
};

const API = "https://api.dexscreener.com";

function mapPairs(pairs: any[], trending: Set<string>): Token[] {
  const best = new Map<string, any>();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a || p.chainId !== "solana" || !(Number(p.priceUsd) > 0) || !Number.isFinite(Number(p.priceUsd))) continue;
    const cur = best.get(a);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(a, p);
  }
  return [...best.values()].map((p) => ({
    address: p.baseToken.address,
    pair: p.pairAddress,
    symbol: String(p.baseToken.symbol).replace(/^\$/, "").trim().toUpperCase(),
    name: String(p.baseToken.name).trim(),
    price: Number(p.priceUsd),
    change5m: p.priceChange?.m5 ?? 0,
    change1h: p.priceChange?.h1 ?? 0,
    change24h: p.priceChange?.h24 ?? 0,
    volume24h: p.volume?.h24 ?? 0,
    liquidity: p.liquidity?.usd ?? 0,
    marketCap: p.marketCap ?? p.fdv ?? 0,
    icon: p.info?.imageUrl,
    pumpfun: p.baseToken.address.endsWith("pump") || p.dexId === "pumpswap" || p.dexId === "pumpfun",
    trending: trending.has(p.baseToken.address),
    pairCreatedAt: typeof p.pairCreatedAt === "number" ? p.pairCreatedAt : undefined,
  }));
}

export async function fetchPrices(addresses: string[]): Promise<Token[]> {
  const out: any[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const r = await fetch(`${API}/tokens/v1/solana/${addresses.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error("Price feed unavailable");
    out.push(...(await r.json()));
  }
  return mapPairs(out, new Set());
}

export async function fetchMemecoins(): Promise<Token[]> {
  const feeds = await Promise.all([
    "/token-profiles/latest/v1", "/token-boosts/latest/v1", "/token-boosts/top/v1",
  ].map(async (path) => {
    try {
      const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? rows.filter((t) => t.chainId === "solana" && typeof t.tokenAddress === "string").map((t) => t.tokenAddress as string) : [];
    } catch { return []; }
  }));
  const all = [...new Set([...CORE_TOKENS, ...feeds.flat()])];
  // Keep each batch independent: one unavailable feed must not hide the other coins.
  const results = await Promise.allSettled(Array.from({ length: Math.ceil(all.length / 30) }, (_, i) => fetchPrices(all.slice(i * 30, i * 30 + 30))));
  const tokens = results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  if (!tokens.length) throw new Error("Price feed unavailable");
  const boosted = new Set([...feeds[1] ?? [], ...feeds[2] ?? []]);
  return tokens.map((t) => ({ ...t, trending: boosted.has(t.address) }))
    .sort((a, b) => b.volume24h - a.volume24h);
}

export const COIN_CATEGORIES = ["New & Risky", "Trending", "Established", "All"] as const;
export type CoinCategory = typeof COIN_CATEGORIES[number];
export function filterCoins(tokens: Token[], category: CoinCategory, query = "", now = Date.now()) {
  const search = query.trim().toLowerCase();
  return tokens.filter((t) => {
    const age = t.pairCreatedAt === undefined ? Infinity : now - t.pairCreatedAt;
    const matches = category === "All" || (category === "New & Risky" && age >= 0 && age <= 24 * 60 * 60 * 1000 && !CORE_TOKENS.includes(t.address))
      || (category === "Trending" && t.trending) || (category === "Established" && CORE_TOKENS.includes(t.address));
    return matches && (!search || [t.name, t.symbol, t.address].some((v) => v.toLowerCase().includes(search)));
  }).sort((a, b) => category === "New & Risky" ? (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0) : b.volume24h - a.volume24h);
}

export function fmtAge(createdAt?: number, now = Date.now()) {
  if (!createdAt || createdAt > now) return "—";
  const minutes = Math.floor((now - createdAt) / 60000);
  return minutes < 1 ? "<1m" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

export const fmtUsd = (n: number) => {
  if (!isFinite(n)) return "$0";
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  if (n === 0) return "$0.00";
  return "$" + n.toPrecision(4);
};
export const fmtCompact = (n: number) =>
  "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
