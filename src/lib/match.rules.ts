export type TradeInput = { matchId: string; token: string; side: "BUY" | "SELL"; usd?: number; closeAll?: boolean };
export function validateTrade(d: TradeInput) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(d.token)) throw new Error("Bad token");
  if (d.side !== "BUY" && d.side !== "SELL") throw new Error("Bad side");
  if (d.closeAll !== undefined && typeof d.closeAll !== "boolean") throw new Error("Bad close option");
  if (!(d.side === "SELL" && d.closeAll) && (!Number.isFinite(d.usd) || !(Number(d.usd) > 0))) throw new Error("Enter a valid dollar amount");
  return d;
}
