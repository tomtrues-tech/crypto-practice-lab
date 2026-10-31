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
};

const API = "https://api.dexscreener.com";

function mapPairs(pairs: any[], trending: Set<string>): Token[] {
  const best = new Map<string, any>();
  for (const p of pairs) {
    const a = p.baseToken?.address;
    if (!a || !p.priceUsd) continue;
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
  }));
}

export async function fetchPrices(addresses: string[]): Promise<Token[]> {
  const out: any[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const r = await fetch(`${API}/tokens/v1/solana/${addresses.slice(i, i + 30).join(",")}`);
    if (!r.ok) throw new Error("Price feed unavailable");
    out.push(...(await r.json()));
  }
  return mapPairs(out, new Set());
}

export async function fetchMemecoins(): Promise<Token[]> {
  let trending: string[] = [];
  try {
    const r = await fetch(`${API}/token-boosts/top/v1`);
    const j = await r.json();
    trending = (j as any[]).filter((t) => t.chainId === "solana").map((t) => t.tokenAddress).slice(0, 22);
  } catch {}
  const all = [...new Set([...CORE_TOKENS, ...trending])];
  const tokens = await fetchPrices(all);
  const tset = new Set(trending.filter((t) => !CORE_TOKENS.includes(t)));
  return tokens
    .map((t) => ({ ...t, trending: tset.has(t.address) }))
    .filter((t) => CORE_TOKENS.includes(t.address) || t.liquidity > 15000)
    .sort((a, b) => b.volume24h - a.volume24h);
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
