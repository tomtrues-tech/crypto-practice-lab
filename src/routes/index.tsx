import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemecoins } from "@/hooks/use-memecoins";
import { TokenTable } from "@/components/trading";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, RefreshCw, Swords, Radio } from "lucide-react";
import { filterCoins, fmtCompact, fmtPct } from "@/lib/memecoins";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "DexDuel — Live Memecoin Market & Paper Trading" },
    { name: "description", content: "Discover new Solana memecoins, practice with paper money, and compete in timed 1v1 trading duels on DexDuel." },
    { property: "og:title", content: "DexDuel — Live Memecoin Market & Paper Trading" },
    { property: "og:description", content: "Fresh memecoins. Real prices. Solo practice and head-to-head trading." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Home,
});

function Home() {
  const { data, isLoading, isError, refetch, isFetching } = useMemecoins();
  const nav = useNavigate();
  const coins = data ?? [];
  const fresh = filterCoins(coins, "New & Risky");
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Radio className="size-3 text-primary" />SOLANA / LIVE MARKET</div><h1 className="font-display text-3xl">DexDuel market</h1></div>
        <div className="flex gap-2"><Button asChild variant="outline"><Link to="/solo">My portfolio<ArrowUpRight /></Link></Button><Button asChild><Link to="/play"><Swords />Start a duel</Link></Button></div>
      </div>
      <div className="mb-6 grid grid-cols-2 border-y md:grid-cols-4">
        <MarketStat label="Tracked coins" value={String(coins.length)} />
        <MarketStat label="Pairs under 24h" value={String(fresh.length)} tone="text-pump" />
        <MarketStat label="24h tracked volume" value={fmtCompact(coins.reduce((s, t) => s + t.volume24h, 0))} />
        <MarketStat label="Starting paper balance" value="$10,000" />
      </div>
      {coins.length > 0 && <div className="mb-6 flex items-center gap-5 overflow-x-auto border-b pb-4"><span className="shrink-0 text-[10px] font-medium text-muted-foreground">HIGH VOLUME</span>{coins.slice(0, 5).map((t) => <Button key={t.address} variant="ghost" className="shrink-0 px-1" onClick={() => nav({ to: "/solo", search: { token: t.address } })}>{t.icon && <img src={t.icon} alt="" className="size-5 rounded-full" />}<span>{t.symbol}</span><span className={`font-mono text-xs ${t.change24h >= 0 ? "text-gain" : "text-loss"}`}>{fmtPct(t.change24h)}</span></Button>)}</div>}
      <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl">Discover</h2><Button variant="ghost" size="sm" disabled={isFetching} onClick={() => refetch()}><RefreshCw className={isFetching ? "animate-spin motion-reduce:animate-none" : ""} />Refresh<span className="hidden text-muted-foreground sm:inline">· 15s</span></Button></div>
      {isLoading ? <div className="border-y py-20 text-center font-mono text-sm text-muted-foreground">Connecting to market feed…</div> : isError ? <div className="border-y py-16 text-center text-muted-foreground">Market feed unavailable. <Button variant="link" onClick={() => refetch()}>Retry</Button></div> : <TokenTable tokens={coins} onSelect={(t) => nav({ to: "/solo", search: { token: t.address } })} />}
      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>DexDuel / Paper trading only</span><span>Market data by DexScreener</span></footer>
    </main>
  );
}

function MarketStat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="min-w-0 py-4 pr-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-xl font-medium ${tone}`}>{value}</div></div>;
}