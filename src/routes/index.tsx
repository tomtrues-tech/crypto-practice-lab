import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PaperPit — Practice Crypto Trading" },
      { name: "description", content: "Paper trade Bitcoin, Ethereum and more with $10,000 of virtual cash and live prices." },
      { property: "og:title", content: "PaperPit — Practice Crypto Trading" },
      { property: "og:description", content: "Paper trade crypto with live prices and zero risk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const IDS = ["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano", "dogecoin", "avalanche-2", "chainlink", "polkadot"];
const FALLBACK: Record<string, [string, string, number]> = {
  bitcoin: ["BTC", "Bitcoin", 68000], ethereum: ["ETH", "Ethereum", 3500], solana: ["SOL", "Solana", 160],
  binancecoin: ["BNB", "BNB", 580], ripple: ["XRP", "XRP", 0.55], cardano: ["ADA", "Cardano", 0.45],
  dogecoin: ["DOGE", "Dogecoin", 0.15], "avalanche-2": ["AVAX", "Avalanche", 35], chainlink: ["LINK", "Chainlink", 15], polkadot: ["DOT", "Polkadot", 7],
};
const START = 10000;
const KEY = "paperpit-v1";

type Coin = { id: string; symbol: string; name: string; price: number; change: number; spark: number[] };
type Trade = { t: number; id: string; side: "BUY" | "SELL"; qty: number; price: number };
type State = { cash: number; holdings: Record<string, { qty: number; cost: number }>; trades: Trade[] };
const fresh = (): State => ({ cash: START, holdings: {}, trades: [] });

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 30}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" strokeWidth="1.5" className={up ? "stroke-gain" : "stroke-loss"} />
    </svg>
  );
}

function Index() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [live, setLive] = useState(true);
  const [st, setSt] = useState<State>(fresh);
  const [sel, setSel] = useState("bitcoin");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = localStorage.getItem(KEY);
    if (s) setSt(JSON.parse(s));
  }, []);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(st)); }, [st]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${IDS.join(",")}&sparkline=true&price_change_percentage=24h`);
        if (!r.ok) throw 0;
        const d = await r.json();
        if (!alive) return;
        setCoins(IDS.map((id) => d.find((c: any) => c.id === id)).filter(Boolean).map((c: any) => ({
          id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, price: c.current_price,
          change: c.price_change_percentage_24h ?? 0, spark: c.sparkline_in_7d?.price?.filter((_: any, i: number) => i % 4 === 0) ?? [],
        })));
        setLive(true);
      } catch {
        if (!alive) return;
        setLive(false);
        setCoins((prev) => IDS.map((id) => {
          const p = prev.find((c) => c.id === id);
          const base = p?.price ?? FALLBACK[id]![2];
          const price = base * (1 + (Math.random() - 0.5) * 0.01);
          return { id, symbol: FALLBACK[id]![0], name: FALLBACK[id]![1], price, change: p ? ((price / FALLBACK[id]![2]) - 1) * 100 : 0, spark: [...(p?.spark ?? []), price].slice(-40) };
        }));
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const coin = coins.find((c) => c.id === sel);
  const priceOf = (id: string) => coins.find((c) => c.id === id)?.price ?? 0;
  const holdVal = useMemo(() => Object.entries(st.holdings).reduce((s, [id, h]) => s + h.qty * priceOf(id), 0), [st, coins]);
  const total = st.cash + holdVal;
  const pnl = total - START;
  const held = st.holdings[sel]?.qty ?? 0;

  const trade = () => {
    const usdAmt = parseFloat(amt);
    if (!coin || !(usdAmt > 0)) return setMsg("Enter a dollar amount.");
    const qty = usdAmt / coin.price;
    const next: State = { ...st, holdings: { ...st.holdings }, trades: [{ t: Date.now(), id: coin.id, side, qty, price: coin.price }, ...st.trades].slice(0, 50) };
    const h = next.holdings[coin.id] ?? { qty: 0, cost: 0 };
    if (side === "BUY") {
      if (usdAmt > st.cash + 1e-9) return setMsg("Not enough cash.");
      next.cash -= usdAmt;
      next.holdings[coin.id] = { qty: h.qty + qty, cost: h.cost + usdAmt };
    } else {
      if (qty > h.qty + 1e-12) return setMsg(`You only hold ${h.qty.toFixed(6)} ${coin.symbol}.`);
      next.cash += usdAmt;
      const rq = h.qty - qty;
      if (rq < 1e-10) delete next.holdings[coin.id];
      else next.holdings[coin.id] = { qty: rq, cost: h.cost * (rq / h.qty) };
    }
    setSt(next); setAmt("");
    setMsg(`${side === "BUY" ? "Bought" : "Sold"} ${qty.toFixed(6)} ${coin.symbol} at ${usd(coin.price)}`);
  };

  const card = "rounded-lg border bg-card p-5";
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Paper<span className="text-primary">Pit</span></h1>
          <p className="text-muted-foreground">Practice crypto trading with $10,000 of fake money.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-gain animate-pulse" : "bg-loss"}`} />
          {live ? "Live prices" : "Simulated prices (live feed unavailable)"}
          <button onClick={() => confirm("Reset your account to $10,000?") && setSt(fresh())} className="ml-3 rounded-md border px-3 py-1 hover:bg-muted">Reset</button>
        </div>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        {[["Total value", usd(total), ""], ["Cash", usd(st.cash), ""], ["Profit / loss", `${pnl >= 0 ? "+" : ""}${usd(pnl)} (${((pnl / START) * 100).toFixed(2)}%)`, pnl >= 0 ? "text-gain" : "text-loss"]].map(([l, v, c]) => (
          <div key={l} className={card}>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{l}</div>
            <div className={`mt-1 font-mono text-2xl font-semibold ${c}`}>{v}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className={`${card} p-0 overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-4">Coin</th><th>Price</th><th>24h</th><th className="hidden sm:table-cell">7d</th><th className="pr-4 text-right">You hold</th></tr>
            </thead>
            <tbody>
              {coins.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading prices…</td></tr>}
              {coins.map((c) => (
                <tr key={c.id} onClick={() => setSel(c.id)} className={`cursor-pointer border-t transition-colors hover:bg-muted ${sel === c.id ? "bg-muted" : ""}`}>
                  <td className="p-4"><span className="font-semibold">{c.symbol}</span> <span className="text-muted-foreground">{c.name}</span></td>
                  <td className="font-mono">{usd(c.price)}</td>
                  <td className={`font-mono ${c.change >= 0 ? "text-gain" : "text-loss"}`}>{c.change >= 0 ? "+" : ""}{c.change.toFixed(2)}%</td>
                  <td className="hidden sm:table-cell"><Spark data={c.spark} up={c.change >= 0} /></td>
                  <td className="pr-4 text-right font-mono text-muted-foreground">{st.holdings[c.id] ? usd(st.holdings[c.id]!.qty * c.price) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="space-y-6">
          <div className={card}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{coin?.name ?? "…"}</h2>
              <span className="font-mono text-primary">{coin ? usd(coin.price) : ""}</span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {(["BUY", "SELL"] as const).map((s) => (
                <button key={s} onClick={() => setSide(s)} className={`rounded-md py-2 text-sm font-semibold ${side === s ? (s === "BUY" ? "bg-gain text-primary-foreground" : "bg-loss text-primary-foreground") : "text-muted-foreground"}`}>{s}</button>
              ))}
            </div>
            <label className="text-xs text-muted-foreground">Amount (USD)</label>
            <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" min="0" placeholder="0.00" className="mt-1 w-full rounded-md border bg-input px-3 py-2 font-mono outline-none focus:border-primary" />
            <div className="mt-2 flex gap-2">
              {[0.25, 0.5, 1].map((f) => (
                <button key={f} onClick={() => setAmt(((side === "BUY" ? st.cash : held * (coin?.price ?? 0)) * f).toFixed(2))} className="flex-1 rounded-md border py-1 text-xs hover:bg-muted">{f === 1 ? "Max" : `${f * 100}%`}</button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ≈ {coin && parseFloat(amt) > 0 ? (parseFloat(amt) / coin.price).toFixed(6) : "0"} {coin?.symbol} · You hold {held.toFixed(6)}
            </p>
            <button onClick={trade} className="mt-4 w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:opacity-90">
              {side === "BUY" ? "Buy" : "Sell"} {coin?.symbol}
            </button>
            {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
          </div>

          <div className={card}>
            <h3 className="mb-3 font-semibold">Recent trades</h3>
            {st.trades.length === 0 ? <p className="text-sm text-muted-foreground">No trades yet.</p> : (
              <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                {st.trades.map((t) => (
                  <li key={t.t} className="flex justify-between font-mono">
                    <span className={t.side === "BUY" ? "text-gain" : "text-loss"}>{t.side}</span>
                    <span>{t.qty.toFixed(5)} {FALLBACK[t.id]?.[0]}</span>
                    <span className="text-muted-foreground">{usd(t.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
