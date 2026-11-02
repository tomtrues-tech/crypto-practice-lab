import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useHeldPrices, useMemecoins } from "@/hooks/use-memecoins";
import { DexChart, Positions, TokenTable, TradePanel, portfolioValue, type Holdings } from "@/components/trading";
import { fetchPrices, fmtPct, fmtUsd } from "@/lib/memecoins";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

const START = 10000;
const KEY = "memeduel-solo-v1";
type Solo = { cash: number; holdings: Holdings };

export const Route = createFileRoute("/solo")({
  validateSearch: (s: Record<string, unknown>): { token?: string } => (typeof s["token"] === "string" ? { token: s["token"] } : {}),
  head: () => ({
    meta: [
      { title: "Solo Practice — DexDuel" },
      { name: "description", content: "Paper trade real memecoins on your own with $10,000 of fake money." },
      { property: "og:title", content: "Solo Practice — DexDuel" },
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

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setSt(JSON.parse(s)); }
    catch { localStorage.removeItem(KEY); }
  }, []);
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
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Your paper portfolio</h1>
          <p className="mt-1 text-xs text-muted-foreground">Solo account / This device</p>
        </div>
        <Button variant="outline" onClick={() => confirm("Reset to $10,000?") && save({ cash: START, holdings: {} })}><RotateCcw />Reset account</Button>
      </div>
      <section className="mb-6 grid gap-4 border-y sm:grid-cols-3">
        <Stat label="Portfolio" value={fmtUsd(total)} />
        <Stat label="Cash" value={fmtUsd(st.cash)} />
        <Stat label="Profit / loss" value={`${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)} (${fmtPct((pnl / START) * 100)})`} tone={pnl >= 0 ? "text-gain" : "text-loss"} />
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {token ? <DexChart token={token} /> : <div className="panel p-10 text-center text-muted-foreground">Loading…</div>}
          <Positions holdings={st.holdings} prices={prices} onSelect={setSel} onClose={async (a) => { await trade("SELL", 0, a, true); }} />
          <TokenTable tokens={tokens ?? []} selected={token?.address} onSelect={(t) => setSel(t.address)} holdings={st.holdings} />
        </div>
        <aside className="row-start-1 xl:sticky xl:top-6 xl:col-start-2 xl:self-start">
          <TradePanel token={token} cash={st.cash} held={token ? st.holdings[token.address]?.qty ?? 0 : 0} onTrade={(s, u) => trade(s, u)} />
        </aside>
      </div>
    </main>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 py-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 break-words font-mono text-xl font-medium ${tone}`}>{value}</div>
    </div>
  );
}
