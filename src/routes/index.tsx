import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemecoins } from "@/hooks/use-memecoins";
import { TokenTable } from "@/components/trading";
import { FlaskConical, Globe, Lock, Swords, type LucideIcon } from "lucide-react";

const FEATURES: [LucideIcon, string, string][] = [
  [Swords, "1v1 duels", "Timed matches you set"],
  [Lock, "Private codes", "Invite only your friends"],
  [Globe, "Public lobbies", "Anyone can jump in"],
  [FlaskConical, "Solo mode", "Practice with no pressure"],
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MemeDuel — 1v1 Memecoin Paper Trading" },
      { name: "description", content: "Duel other traders on real pump.fun and DexScreener memecoins with fake money. Or practice solo." },
      { property: "og:title", content: "MemeDuel — 1v1 Memecoin Paper Trading" },
      { property: "og:description", content: "Who trades memecoins better? Find out in timed 1v1 paper-trading duels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data, isLoading, isError } = useMemecoins();
  const nav = useNavigate();
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <section className="mb-12 grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <span className="tag tag-pump">live memecoin prices</span>
          <h1 className="mt-4 font-display text-5xl leading-[0.95] md:text-7xl">Who trades<br />memes <span className="text-primary">better?</span></h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">Go head-to-head on real pump.fun and DexScreener coins. Same $10,000 of fake cash, same clock. Biggest bag at the buzzer wins.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/play" className="btn-primary">Start a 1v1</Link>
            <Link to="/solo" className="btn-ghost">Practice solo</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="panel p-4"><Icon className="h-6 w-6 text-primary" aria-hidden /><div className="mt-2 font-semibold">{t}</div><div className="text-sm text-muted-foreground">{d}</div></div>
          ))}
        </div>
      </section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display text-2xl">Trending memecoins</h2>
        <span className="text-xs text-muted-foreground">Data from DexScreener · refreshes every 15s</span>
      </div>
      {isLoading ? <div className="panel p-8 text-center text-muted-foreground">Loading coins…</div>
        : isError ? <div className="panel p-8 text-center text-muted-foreground">Couldn't load prices right now. Try again in a moment.</div>
        : <TokenTable tokens={data ?? []} onSelect={(t) => nav({ to: "/solo", search: { token: t.address } })} />}
    </main>
  );
}
