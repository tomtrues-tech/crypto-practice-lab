import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { finishMatch, joinMatch, leaveMatch, placeTrade } from "@/lib/match.functions";
import { useHeldPrices, useMemecoins } from "@/hooks/use-memecoins";
import { DexChart, Positions, TokenTable, TradePanel, portfolioValue, type Holdings } from "@/components/trading";
import { fmtPct, fmtUsd } from "@/lib/memecoins";

export const Route = createFileRoute("/_authenticated/match/$id")({
  head: () => ({
    meta: [
      { title: "Match — DexDuel" },
      { name: "description", content: "A live 1v1 memecoin trading duel." },
      { property: "og:title", content: "You've been challenged on DexDuel" },
      { property: "og:description", content: "Join this 1v1 memecoin trading duel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MatchPage,
});

function useNow() {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(i); }, []);
  return n;
}

function MatchPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const now = useNow();
  const trade = useServerFn(placeTrade);
  const finish = useServerFn(finishMatch);
  const join = useServerFn(joinMatch);
  const leave = useServerFn(leaveMatch);
  const [sel, setSel] = useState<string>();
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const finishing = useRef(false);
  const lastFinishAttempt = useRef(0);

  const me = useQuery({ queryKey: ["me"], queryFn: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Please sign in again");
    return data.user.id;
  } });
  const q = useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const [matchResult, playersResult] = await Promise.all([
        supabase.from("matches").select("*").eq("id", id).maybeSingle(),
        supabase.from("match_players").select("*").eq("match_id", id).order("joined_at"),
      ]);
      if (matchResult.error) throw matchResult.error;
      if (playersResult.error) throw playersResult.error;
      return { match: matchResult.data, players: playersResult.data ?? [] };
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    const ch = supabase.channel(`match-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["match", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_players", filter: `match_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["match", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const { data: tokens } = useMemecoins();
  const allHeld = (q.data?.players ?? []).flatMap((p) => Object.keys(p.holdings as Holdings));
  const prices = useHeldPrices([...new Set(allHeld)], tokens);

  const match = q.data?.match;
  const players = q.data?.players ?? [];
  const mine = players.find((p) => p.user_id === me.data);
  const endsAt = match?.ends_at ? new Date(match.ends_at).getTime() : 0;
  const left = Math.max(0, endsAt - now);
  const live = match?.status === "active" && left > 0;

  useEffect(() => {
    if (match?.status === "active" && endsAt && now >= endsAt && mine && !finishing.current && now - lastFinishAttempt.current >= 5000) {
      lastFinishAttempt.current = now;
      finishing.current = true;
      finish({ data: { id } }).then(() => setErr("")).catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Final scoring unavailable; retrying.");
      }).finally(() => { finishing.current = false; qc.invalidateQueries({ queryKey: ["match", id] }); });
    }
  }, [now, endsAt, match?.status, mine, id, finish, qc]);

  if (q.isLoading || me.isLoading) return <Center>Loading match…</Center>;
  if (q.isError || me.isError) return <Center>Could not load this match. Please refresh and try again.</Center>;
  if (!match) return <Center>This match doesn't exist or is private. <Link to="/play" className="text-primary underline">Back to arena</Link></Center>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/play?code=${match.code}` : "";

  // Not a member yet
  if (!mine) {
    return (
      <Center>
        <h1 className="font-display text-4xl">You've been challenged</h1>
        <p className="mt-2 text-muted-foreground">{players[0]?.username} wants a {match.duration_minutes}-minute memecoin duel.</p>
        {match.status === "waiting" ? (
          <button className="btn-primary mt-6" onClick={async () => { try { await join({ data: { id } }); qc.invalidateQueries({ queryKey: ["match", id] }); } catch (e) { setErr((e as Error).message); } }}>Accept & start</button>
        ) : <p className="mt-6">This match has already started.</p>}
        {err && <p className="mt-3 text-loss">{err}</p>}
      </Center>
    );
  }

  if (match.status === "waiting") {
    return (
      <Center>
        <div className="text-sm uppercase tracking-widest text-muted-foreground">{match.is_public ? "Public" : "Private"} match · {match.duration_minutes} min</div>
        <h1 className="mt-3 font-display text-4xl">Waiting for an opponent…</h1>
        <div className="panel mx-auto mt-8 max-w-sm p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Match code</div>
          <div className="mt-2 font-mono text-5xl tracking-[0.25em] text-primary">{match.code}</div>
          <button className="btn-ghost mt-5 w-full text-sm" onClick={async () => { try { await navigator.clipboard.writeText(link); setNotice("Invite link copied!"); } catch { setNotice("Couldn't copy. Share the code instead."); } }}>Copy invite link</button>
          {notice && <p role="status" className="mt-2 text-xs text-muted-foreground">{notice}</p>}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">The match starts the moment someone joins.</p>
        {match.host_id === me.data && <button className="mt-4 text-sm text-loss hover:underline" onClick={async () => { await leave({ data: { id } }); nav({ to: "/play" }); }}>Cancel match</button>}
      </Center>
    );
  }

  const start = Number(match.starting_cash);
  const scores = players.map((p) => {
    const v = p.final_value != null ? Number(p.final_value) : portfolioValue(Number(p.cash), p.holdings as Holdings, prices);
    return { ...p, value: v, pct: ((v - start) / start) * 100 };
  }).sort((a, b) => b.value - a.value);
  const myHoldings = mine.holdings as Holdings;
  const token = (sel && prices.get(sel)) || tokens?.[0];
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);

  const doTrade = async (side: "BUY" | "SELL", usd: number) => {
    if (!token) throw new Error("Pick a token first");
    const r = await trade({ data: { matchId: id, token: token.address, side, usd } });
    qc.invalidateQueries({ queryKey: ["match", id] });
    return `${side === "BUY" ? "Bought" : "Sold"} ${r.symbol} at ${fmtUsd(r.price)}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {err && <p role="alert" className="mb-4 text-sm text-loss">{err}</p>}
      {match.status === "active" && !live && <p role="status" className="mb-4 text-sm text-muted-foreground">Settling final scores…</p>}
      {match.status === "finished" && (
        <div className="panel mb-6 p-6 text-center">
          <div className="font-display text-4xl">{match.winner_id === me.data ? <span className="inline-flex items-center gap-3"><Trophy className="h-9 w-9 text-primary" aria-hidden />You won!</span> : match.winner_id ? "You lost this one" : "It's a tie"}</div>
          <p className="mt-1 text-muted-foreground">Final scores are locked in below.</p>
          <Link to="/play" className="btn-primary mt-4 inline-block">Play again</Link>
        </div>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        {scores.slice(0, 2).map((p, i) => (
          <div key={p.user_id} className={`panel p-5 ${i === 0 ? "border-primary" : ""} ${i === 1 ? "md:order-3 md:text-right" : ""}`}>
            <div className="text-sm text-muted-foreground">{i === 0 ? "Leading" : "Chasing"}{p.user_id === me.data ? " · you" : ""}</div>
            <div className="font-display text-2xl">{p.username}</div>
            <div className="font-mono text-xl">{fmtUsd(p.value)} <span className={p.pct >= 0 ? "text-gain" : "text-loss"}>{fmtPct(p.pct)}</span></div>
          </div>
        ))}
        <div className="panel flex flex-col items-center justify-center px-8 py-4 md:order-2">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{live ? "Time left" : "Final"}</div>
          <div className={`font-mono text-4xl font-bold ${live && left < 60000 ? "text-loss animate-pulse" : ""}`}>{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {token && <DexChart token={token} />}
          <Positions holdings={myHoldings} prices={prices} onSelect={setSel} disabled={!live}
            onClose={async (a) => { await trade({ data: { matchId: id, token: a, side: "SELL", closeAll: true } }); qc.invalidateQueries({ queryKey: ["match", id] }); }} />
          <TokenTable tokens={tokens ?? []} selected={token?.address} onSelect={(t) => setSel(t.address)} holdings={myHoldings} />
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <TradePanel token={token} cash={Number(mine.cash)} held={token ? myHoldings[token.address]?.qty ?? 0 : 0} onTrade={doTrade} disabled={live ? undefined : "Match over"} />
        </aside>
      </div>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 py-20 text-center">{children}</main>;
}
