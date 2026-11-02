import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createMatch, joinMatch } from "@/lib/match.functions";

export const Route = createFileRoute("/_authenticated/play")({
  head: () => ({
    meta: [
      { title: "1v1 Arena — DexDuel" },
      { name: "description", content: "Host or join a timed memecoin trading duel." },
      { property: "og:title", content: "1v1 Arena — DexDuel" },
      { property: "og:description", content: "Host or join a timed memecoin trading duel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Play,
});

const LENGTHS = [5, 15, 30, 60];

function Play() {
  const nav = useNavigate();
  const create = useServerFn(createMatch);
  const join = useServerFn(joinMatch);
  const [isPublic, setIsPublic] = useState(true);
  const [minutes, setMinutes] = useState(15);
  const [custom, setCustom] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const open = useQuery({
    queryKey: ["open-matches"],
    queryFn: async () => {
      const { data } = await supabase.from("matches").select("id, code, duration_minutes, created_at, host_id, match_players(username)")
        .eq("status", "waiting").eq("is_public", true).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
    refetchInterval: 5000,
  });
  const mine = useQuery({
    queryKey: ["my-matches"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("match_players").select("match_id, matches(id, code, status, ends_at)").eq("user_id", u.user!.id).order("joined_at", { ascending: false }).limit(10);
      return (data ?? []).map((r: any) => r.matches).filter((m: any) => m && m.status !== "finished");
    },
  });

  const run = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true); setErr("");
    try { const r = await fn(); nav({ to: "/match/$id", params: { id: r.id } }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };
  const duration = custom ? Number(custom) : minutes;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-5xl">1v1 Arena</h1>
      <p className="mt-2 text-muted-foreground">Both players start with $10,000. Highest portfolio when time runs out wins.</p>
      {err && <p className="mt-4 rounded-md border border-loss p-3 text-sm text-loss">{err}</p>}

      {mine.data && mine.data.length > 0 && (
        <div className="panel mt-6 p-4">
          <div className="mb-2 text-sm font-semibold">Your live matches</div>
          <div className="flex flex-wrap gap-2">
            {mine.data.map((m: any) => (
              <Link key={m.id} to="/match/$id" params={{ id: m.id }} className="btn-ghost !py-1.5 text-sm">#{m.code} · {m.status}</Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="panel p-6">
          <h2 className="font-display text-2xl">Host a match</h2>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {[[true, "Public"], [false, "Private"]].map(([v, l]) => (
              <button key={String(v)} onClick={() => setIsPublic(v as boolean)} className={`rounded py-2 text-sm font-bold ${isPublic === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l as string}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{isPublic ? "Anyone can find and join your match." : "Only people with your code or link can join."}</p>
          <div className="mt-5 text-sm font-semibold">Match length</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {LENGTHS.map((m) => (
              <button key={m} onClick={() => { setMinutes(m); setCustom(""); }} className={`rounded-md border px-4 py-2 text-sm font-semibold ${!custom && minutes === m ? "border-primary text-primary" : "text-muted-foreground"}`}>{m < 60 ? `${m} min` : "1 hr"}</button>
            ))}
            <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} placeholder="Custom min" className="w-28 rounded-md border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <button disabled={busy || !(duration >= 1 && duration <= 1440)} onClick={() => run(() => create({ data: { isPublic, durationMinutes: duration } }))} className="btn-primary mt-6 w-full">Create {duration}-minute match</button>
        </div>

        <div className="panel p-6">
          <h2 className="font-display text-2xl">Join with a code</h2>
          <form onSubmit={(e) => { e.preventDefault(); run(() => join({ data: { code } })); }} className="mt-5 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" className="flex-1 rounded-md border bg-input px-3 py-3 font-mono text-xl tracking-[0.3em] outline-none focus:border-primary" />
            <button disabled={busy || code.length < 6} className="btn-primary">Join</button>
          </form>

          <h3 className="mt-8 mb-3 font-semibold">Open public matches</h3>
          {open.data?.length ? (
            <ul className="space-y-2">
              {open.data.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between rounded-md border p-3">
                  <div><div className="font-semibold">{m.match_players?.[0]?.username ?? "someone"}</div><div className="text-xs text-muted-foreground">{m.duration_minutes} min match</div></div>
                  <button disabled={busy} onClick={() => run(() => join({ data: { id: m.id } }))} className="btn-primary !py-2 text-sm">Join</button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No open matches right now. Host one!</p>}
        </div>
      </div>
    </main>
  );
}
