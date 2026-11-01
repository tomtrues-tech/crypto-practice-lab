import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchPrices } from "@/lib/memecoins";

type Holdings = Record<string, { qty: number; cost: number; symbol: string }>;

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function myUsername(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  return (data?.username as string) ?? "trader";
}

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export const createMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { isPublic: boolean; durationMinutes: number }) => {
    const m = Math.round(Number(d.durationMinutes));
    if (!(m >= 1 && m <= 1440)) throw new Error("Match length must be 1–1440 minutes");
    return { isPublic: !!d.isPublic, durationMinutes: m };
  })
  .handler(async ({ data, context }) => {
    const db = await admin();
    const username = await myUsername(context.supabase, context.userId);
    let match: any = null;
    for (let i = 0; i < 5 && !match; i++) {
      const { data: m } = await db.from("matches").insert({
        code: newCode(), host_id: context.userId, is_public: data.isPublic, duration_minutes: data.durationMinutes,
      }).select().single();
      match = m;
    }
    if (!match) throw new Error("Could not create match");
    await db.from("match_players").insert({ match_id: match.id, user_id: context.userId, username, cash: match.starting_cash });
    return { id: match.id as string, code: match.code as string };
  });

export const joinMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; code?: string }) => ({ id: d.id?.trim(), code: d.code?.trim().toUpperCase() }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    let q = db.from("matches").select("*");
    q = data.id ? q.eq("id", data.id) : q.eq("code", data.code ?? "");
    const { data: match } = await q.maybeSingle();
    if (!match) throw new Error("No match found with that code");
    const { data: players } = await db.from("match_players").select("user_id").eq("match_id", match.id);
    if (players?.some((p) => p.user_id === context.userId)) return { id: match.id as string };
    if (match.status !== "waiting" || (players?.length ?? 0) >= 2) throw new Error("This match is already full or started");
    const username = await myUsername(context.supabase, context.userId);
    const { error } = await db.from("match_players").insert({ match_id: match.id, user_id: context.userId, username, cash: match.starting_cash });
    if (error) throw new Error("Could not join match");
    const now = new Date();
    await db.from("matches").update({
      status: "active", started_at: now.toISOString(),
      ends_at: new Date(now.getTime() + match.duration_minutes * 60000).toISOString(),
    }).eq("id", match.id).eq("status", "waiting");
    return { id: match.id as string };
  });

export const leaveMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: match } = await db.from("matches").select("*").eq("id", data.id).maybeSingle();
    if (!match || match.host_id !== context.userId || match.status !== "waiting") throw new Error("Can't cancel this match");
    await db.from("matches").delete().eq("id", data.id);
    return { ok: true };
  });

export const placeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matchId: string; token: string; side: "BUY" | "SELL"; usd?: number; closeAll?: boolean }) => {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(d.token)) throw new Error("Bad token");
    if (d.side !== "BUY" && d.side !== "SELL") throw new Error("Bad side");
    return d;
  })
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: match } = await db.from("matches").select("*").eq("id", data.matchId).maybeSingle();
    if (!match || match.status !== "active" || new Date(match.ends_at ?? 0).getTime() < Date.now()) throw new Error("Match is not live");
    const { data: me } = await db.from("match_players").select("*").eq("match_id", match.id).eq("user_id", context.userId).maybeSingle();
    if (!me) throw new Error("You're not in this match");

    const [tok] = await fetchPrices([data.token]);
    if (!tok) throw new Error("Couldn't get a price for that token");
    const holdings: Holdings = { ...(me.holdings as Holdings) };
    let cash = Number(me.cash);
    const h = holdings[data.token] ?? { qty: 0, cost: 0, symbol: tok.symbol };
    let qty: number;

    if (data.side === "BUY") {
      const usd = Number(data.usd);
      if (!(usd > 0) || usd > cash + 1e-6) throw new Error("Not enough cash");
      qty = usd / tok.price;
      cash -= usd;
      holdings[data.token] = { qty: h.qty + qty, cost: h.cost + usd, symbol: tok.symbol };
    } else {
      if (h.qty <= 0) throw new Error("You don't hold that token");
      qty = data.closeAll ? h.qty : Math.min(h.qty, Number(data.usd) / tok.price);
      if (!(qty > 0)) throw new Error("Enter an amount");
      cash += qty * tok.price;
      const rest = h.qty - qty;
      if (rest <= h.qty * 1e-9) delete holdings[data.token];
      else holdings[data.token] = { qty: rest, cost: h.cost * (rest / h.qty), symbol: h.symbol };
    }
    await db.from("match_players").update({ cash, holdings }).eq("match_id", match.id).eq("user_id", context.userId);
    await db.from("match_trades").insert({ match_id: match.id, user_id: context.userId, token: data.token, symbol: tok.symbol, side: data.side, qty, price: tok.price });
    return { price: tok.price, qty, symbol: tok.symbol };
  });

export const finishMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: match } = await db.from("matches").select("*").eq("id", data.id).maybeSingle();
    if (!match || match.status !== "active") return { ok: true };
    if (new Date(match.ends_at ?? 0).getTime() > Date.now()) throw new Error("Match still running");
    const { data: players } = await db.from("match_players").select("*").eq("match_id", match.id);
    if (!players?.some((p) => p.user_id === context.userId)) throw new Error("Not in match");
    const addrs = [...new Set(players.flatMap((p) => Object.keys(p.holdings as Holdings)))];
    const prices = new Map((addrs.length ? await fetchPrices(addrs) : []).map((t) => [t.address, t.price]));
    let best = -Infinity; let winner: string | null = null;
    for (const p of players) {
      const hs = p.holdings as Holdings;
      const v = Number(p.cash) + Object.entries(hs).reduce((s, [a, h]) => s + h.qty * (prices.get(a) ?? h.cost / h.qty), 0);
      await db.from("match_players").update({ final_value: v }).eq("match_id", match.id).eq("user_id", p.user_id);
      if (v > best) { best = v; winner = p.user_id; } else if (v === best) winner = null;
    }
    await db.from("matches").update({ status: "finished", winner_id: winner }).eq("id", match.id).eq("status", "active");
    return { ok: true };
  });
