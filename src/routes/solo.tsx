import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHeldPrices, useMemecoins } from "@/hooks/use-memecoins";
import { DexChart, Positions, TokenTable, TradePanel, portfolioValue, type Holdings } from "@/components/trading";
import { fetchPrices, fmtPct, fmtUsd } from "@/lib/memecoins";

const START = 10000;
const KEY = "memeduel-solo-v1";
type Solo = { cash: number; holdings: Holdings };

export const Route = createFileRoute("/solo")({
  validateSearch: (s: Record<string, unknown>): { token?: string } => (typeof s["token"] === "string" ? { token: s["token"] } : {}),
  head: () => ({
    meta: [
      { title: "Solo Practice — MemeDuel" },
      { name: "description", content: "Paper trade real memecoins on your own with $10,000 of fake money." },
      { property: "og:title", content: "Solo Practice — MemeDuel" },
      { property: "og:description", content: "Practice memecoin trading risk-free." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SoloPage,
});

function SoloPage() {
  const { token: initial } = Route.useSearch();
  const { data: tokens } = useMemecoins();
  const [st, setSt] = useState<Solo>({ cash: START, holdings: {} });
  const [sel, setSel] = useState<string | undefined>(initial);

  useEffect(() => { const s = localStorage.getItem(KEY); if (s) setSt(JSON.parse(s)); }, []);
  const save = (n: Solo) => { setSt(n); localStorage.setItem(KEY, JSON.stringify(n)); };

  const prices = useHeldPrices(Object.keys(st.holdings), tokens);
  const token = (sel && prices.get(sel)) || tokens?.[0];
  const total = portfolioValue(st.cash, st.holdings, prices);
  const pnl = total - START;

  const trade = async (side: "BUY" | "SELL", usd: number, address = token?.address, closeAll = false) => {
    if (!address) throw new Error("Pick a token");
    const [fresh] = await fetchPrices([address]).catch(() => [prices.get(address)]);
    if (!fresh) throw new Error("No price available");
    const holdings = { ...st.holdings };
    const h = holdings[address] ?? { qty: 0, cost: 0, symbol: fresh.symbol };
    let cash = st.cash;
    let qty: number;
    if (side === "BUY") {
      qty = usd / fresh.price; cash -= usd;
      holdings[address] = { qty: h.qty + qty, cost: h.cost + usd, symbol: fresh.symbol };
    } else {
      qty = closeAll ? h.qty : Math.min(h.qty, usd / fresh.price);
      cash += qty * fresh.price;
      const rest = h.qty - qty;
      if (rest <= h.qty * 1e-9) delete holdings[address];
      else holdings[address] = { ...h, qty: rest, cost: h.cost * (rest / h.qty) };
    }
    save({ cash, holdings });
    return `${side === "BUY" ? "Bought" : "Sold"} ${fresh.symbol} at ${fmtUsd(fresh.price)}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Solo practice</h1>
          <p className="text-muted-foreground">Just you and the charts. Saved on this device.</p>
        </div>
        <button onClick={() => confirm("Reset to $10,000?") && save({ cash: START, holdings: {} })} className="btn-ghost !py-2 text-sm">Reset account</button>
      </div>
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Portfolio" value={fmtUsd(total)} />
        <Stat label="Cash" value={fmtUsd(st.cash)} />
        <Stat label="Profit / loss" value={`${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)} (${fmtPct((pnl / START) * 100)})`} tone={pnl >= 0 ? "text-gain" : "text-loss"} />
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {token ? <DexChart token={token} /> : <div className="panel p-10 text-center text-muted-foreground">Loading…</div>}
          <Positions holdings={st.holdings} prices={prices} onSelect={setSel} onClose={async (a) => { await trade("SELL", 0, a, true); }} />
          <TokenTable tokens={tokens ?? []} selected={token?.address} onSelect={(t) => setSel(t.address)} holdings={st.holdings} />
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <TradePanel token={token} cash={st.cash} held={token ? st.holdings[token.address]?.qty ?? 0 : 0} onTrade={(s, u) => trade(s, u)} />
        </aside>
      </div>
    </main>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
