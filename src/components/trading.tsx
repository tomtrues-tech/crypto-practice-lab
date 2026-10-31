import { useState } from "react";
import { fmtCompact, fmtPct, fmtUsd, type Token } from "@/lib/memecoins";

export type Holding = { qty: number; cost: number; symbol: string };
export type Holdings = Record<string, Holding>;

export function portfolioValue(cash: number, holdings: Holdings, prices: Map<string, Token>) {
  return cash + Object.entries(holdings).reduce((s, [a, h]) => s + h.qty * (prices.get(a)?.price ?? h.cost / h.qty), 0);
}

function Pct({ v }: { v: number }) {
  return <span className={v >= 0 ? "text-gain" : "text-loss"}>{fmtPct(v)}</span>;
}

export function TokenTable({ tokens, selected, onSelect, holdings }: { tokens: Token[]; selected?: string; onSelect: (t: Token) => void; holdings?: Holdings }) {
  return (
    <div className="panel overflow-hidden">
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Token</th><th>Price</th><th>5m</th><th>1h</th><th>24h</th><th className="hidden md:table-cell">Vol</th><th className="hidden md:table-cell pr-3">MCap</th></tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.address} onClick={() => onSelect(t)} className={`cursor-pointer border-t font-mono transition-colors hover:bg-muted ${selected === t.address ? "bg-muted" : ""}`}>
                <td className="p-3 font-sans">
                  <div className="flex items-center gap-2">
                    {t.icon ? <img src={t.icon} alt="" className="h-7 w-7 rounded-full" /> : <div className="h-7 w-7 rounded-full bg-muted" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 font-semibold">
                        <span className="truncate max-w-[110px]">{t.symbol}</span>
                        {t.pumpfun && <span className="tag tag-pump">pump</span>}
                        {t.trending && <span className="tag tag-hot">hot</span>}
                        {holdings?.[t.address] && <span className="tag">held</span>}
                      </div>
                      <div className="truncate max-w-[140px] text-xs text-muted-foreground">{t.name}</div>
                    </div>
                  </div>
                </td>
                <td>{fmtUsd(t.price)}</td>
                <td><Pct v={t.change5m} /></td>
                <td><Pct v={t.change1h} /></td>
                <td><Pct v={t.change24h} /></td>
                <td className="hidden md:table-cell text-muted-foreground">{fmtCompact(t.volume24h)}</td>
                <td className="hidden md:table-cell pr-3 text-muted-foreground">{fmtCompact(t.marketCap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DexChart({ token }: { token: Token }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-3">
          {token.icon && <img src={token.icon} alt="" className="h-9 w-9 rounded-full" />}
          <div>
            <div className="font-display text-xl">{token.symbol} <span className="font-sans text-sm text-muted-foreground">{token.name}</span></div>
            <div className="font-mono text-sm">{fmtUsd(token.price)} <Pct v={token.change24h} /> <span className="text-muted-foreground">24h</span></div>
          </div>
        </div>
        <div className="flex gap-4 font-mono text-xs text-muted-foreground">
          <span>Liq {fmtCompact(token.liquidity)}</span><span>Vol {fmtCompact(token.volume24h)}</span><span>MCap {fmtCompact(token.marketCap)}</span>
        </div>
      </div>
      <iframe
        key={token.pair}
        title={`${token.symbol} chart`}
        src={`https://dexscreener.com/solana/${token.pair}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=1`}
        className="h-[420px] w-full border-0"
      />
    </div>
  );
}

export function TradePanel({ token, cash, held, onTrade, disabled }: { token?: Token; cash: number; held: number; onTrade: (side: "BUY" | "SELL", usd: number) => Promise<string>; disabled?: string }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const heldUsd = held * (token?.price ?? 0);

  const go = async () => {
    const v = parseFloat(amt);
    if (!token || !(v > 0)) return setMsg("Enter a dollar amount.");
    if (side === "BUY" && v > cash + 1e-6) return setMsg("Not enough cash.");
    if (side === "SELL" && v > heldUsd * 1.0001) return setMsg(`You only hold ${fmtUsd(heldUsd)} of ${token.symbol}.`);
    setBusy(true);
    try { setMsg(await onTrade(side, Math.min(v, side === "SELL" ? heldUsd : v))); setAmt(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Trade failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl">{token ? `Trade ${token.symbol}` : "Pick a token"}</h2>
        <span className="font-mono text-primary">{token ? fmtUsd(token.price) : ""}</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(["BUY", "SELL"] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className={`rounded py-2 text-sm font-bold ${side === s ? (s === "BUY" ? "bg-gain text-primary-foreground" : "bg-loss text-primary-foreground") : "text-muted-foreground"}`}>{s}</button>
        ))}
      </div>
      <label className="text-xs text-muted-foreground">Amount (USD)</label>
      <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" min="0" placeholder="0.00" className="mt-1 w-full rounded-md border bg-input px-3 py-2 font-mono outline-none focus:border-primary" />
      <div className="mt-2 flex gap-2">
        {[0.1, 0.25, 0.5, 1].map((f) => (
          <button key={f} onClick={() => setAmt(((side === "BUY" ? cash : heldUsd) * f).toFixed(2))} className="flex-1 rounded border py-1 text-xs hover:bg-muted">{f === 1 ? "Max" : `${f * 100}%`}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Cash {fmtUsd(cash)} · Holding {fmtUsd(heldUsd)}</p>
      <button disabled={!!disabled || busy || !token} onClick={go} className="btn-primary mt-4 w-full">
        {disabled ?? (busy ? "Placing…" : `${side === "BUY" ? "Buy" : "Sell"} ${token?.symbol ?? ""}`)}
      </button>
      {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function Positions({ holdings, prices, onClose, onSelect, disabled }: { holdings: Holdings; prices: Map<string, Token>; onClose: (address: string) => Promise<void>; onSelect?: (a: string) => void; disabled?: boolean }) {
  const [closing, setClosing] = useState<string | null>(null);
  const rows = Object.entries(holdings);
  return (
    <div className="panel p-5">
      <h3 className="mb-3 font-display text-lg">Open positions</h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No open positions yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-2">Token</th><th>Entry</th><th>Now</th><th>Value</th><th>P/L</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(([a, h]) => {
                const entry = h.cost / h.qty;
                const now = prices.get(a)?.price ?? entry;
                const v = h.qty * now; const pl = v - h.cost;
                return (
                  <tr key={a} className="border-t font-mono">
                    <td className="py-3 font-sans font-semibold"><button onClick={() => onSelect?.(a)}>{h.symbol}</button></td>
                    <td>{fmtUsd(entry)}</td>
                    <td>{fmtUsd(now)}</td>
                    <td>{fmtUsd(v)}</td>
                    <td className={pl >= 0 ? "text-gain" : "text-loss"}>{pl >= 0 ? "+" : ""}{fmtUsd(pl)} ({fmtPct((pl / h.cost) * 100)})</td>
                    <td className="text-right">
                      <button disabled={disabled || closing === a} onClick={async () => { setClosing(a); try { await onClose(a); } finally { setClosing(null); } }} className="btn-close">
                        {closing === a ? "…" : "Close"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
