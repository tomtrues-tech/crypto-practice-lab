import { afterEach, describe, expect, it, vi } from "vitest";
import { CORE_TOKENS, fetchMemecoins, filterCoins, type Token } from "@/lib/memecoins";

const NOW = 1793581200000;
const token = (overrides: Partial<Token> = {}): Token => ({
  address: "freshpump", pair: "pair", symbol: "FRESH", name: "Fresh coin", price: 0.001,
  change5m: 0, change1h: 0, change24h: 0, volume24h: 100, liquidity: 10,
  marketCap: 1000, pumpfun: true, trending: false, pairCreatedAt: NOW - 60000, ...overrides,
});
afterEach(() => vi.unstubAllGlobals());

describe("Real memecoin discovery", () => {
  it("includes very new risky coins even with just $10 liquidity", () => {
    expect(filterCoins([token()], "New & Risky", "", NOW).map((t) => t.address)).toEqual(["freshpump"]);
  });
  it("keeps pairs older than 24 hours or with unknown dates out of New & Risky", () => {
    expect(filterCoins([token({ pairCreatedAt: NOW - 86400001 }), token({ pairCreatedAt: undefined })], "New & Risky", "", NOW)).toEqual([]);
  });
  it("separates boosted and established coins", () => {
    const rows = [token(), token({ address: CORE_TOKENS[0], trending: true })];
    expect(filterCoins(rows, "Established", "", NOW).map((t) => t.address)).toEqual([CORE_TOKENS[0]]);
    expect(filterCoins(rows, "Trending", "", NOW).map((t) => t.address)).toEqual([CORE_TOKENS[0]]);
  });
  it("searches real token addresses as well as symbols", () => {
    expect(filterCoins([token()], "All", "freshpump", NOW)).toHaveLength(1);
    expect(filterCoins([token()], "All", "missing", NOW)).toHaveLength(0);
  });
  it("combines latest profiles and boosts without a liquidity floor", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("token-profiles")) return Response.json([{ chainId: "solana", tokenAddress: "profilepump" }]);
      if (url.includes("token-boosts/latest")) return Response.json([{ chainId: "solana", tokenAddress: "latestpump" }]);
      if (url.includes("token-boosts/top")) return Response.json([{ chainId: "solana", tokenAddress: "toppump" }]);
      return Response.json(url.split("/").at(-1)?.split(",").map((address) => ({
        chainId: "solana", baseToken: { address, symbol: "TEST", name: "Test" },
        pairAddress: address, priceUsd: "0.001", liquidity: { usd: 10 }, pairCreatedAt: NOW - 60000,
      })));
    }));
    const coins = await fetchMemecoins();
    expect(coins.map((t) => t.address)).toEqual(expect.arrayContaining(["profilepump", "latestpump", "toppump"]));
    expect(coins.find((t) => t.address === "profilepump")?.liquidity).toBe(10);
    expect(coins.find((t) => t.address === "latestpump")?.trending).toBe(true);
  });
});