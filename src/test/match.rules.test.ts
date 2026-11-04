import { describe, expect, it } from "vitest";
import { validateTrade } from "@/lib/match.rules";
const base = { matchId: "match", token: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", side: "BUY" as const };
describe("Match trade validation", () => {
  it("accepts a $1,000 buy", () => expect(validateTrade({ ...base, usd: 1000 }).usd).toBe(1000));
  it("rejects zero-dollar trades", () => expect(() => validateTrade({ ...base, usd: 0 })).toThrow());
  it("rejects negative trades", () => expect(() => validateTrade({ ...base, usd: -500 })).toThrow());
  it("rejects non-finite trades", () => expect(() => validateTrade({ ...base, usd: Infinity })).toThrow());
  it("requires an amount for partial sells", () => expect(() => validateTrade({ ...base, side: "SELL" })).toThrow());
  it("allows closing the entire position without an amount", () => expect(validateTrade({ ...base, side: "SELL", closeAll: true }).closeAll).toBe(true));
  it("does not let closeAll bypass buy validation", () => expect(() => validateTrade({ ...base, closeAll: true })).toThrow());
});
