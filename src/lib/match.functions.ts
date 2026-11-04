import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchPrices } from "@/lib/memecoins";
import { validateTrade } from "@/lib/match.rules";
import type { Json } from "@/integrations/supabase/types";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function action<T>(name: string, user: string, data: Json): Promise<T> {
  const db = await admin();
  const result = await db.rpc("duel_action", { p_action: name, p_user: user, p_data: data });
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const createMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { isPublic: boolean; durationMinutes: number }) => {
    const m = Math.round(Number(d.durationMinutes));
    if (!(m >= 1 && m <= 1440)) throw new Error("Match length must be 1–1440 minutes");
    return { isPublic: !!d.isPublic, durationMinutes: m };
  })
  .handler(({ data, context }) => action<{ id: string; code: string }>("create", context.userId, data));

export const joinMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; code?: string }) => ({ id: d.id?.trim() ?? "", code: d.code?.trim().toUpperCase() ?? "" }))
  .handler(({ data, context }) => action<{ id: string }>("join", context.userId, data));

export const leaveMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(({ data, context }) => action<{ ok: boolean }>("cancel", context.userId, data));

export const placeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateTrade)
  .handler(async ({ data, context }) => {
    // Check membership before contacting the price provider; the locked action
    // rechecks membership, balance and deadline after the price arrives.
    const member = await context.supabase.from("match_players").select("user_id").eq("match_id", data.matchId).eq("user_id", context.userId).maybeSingle();
    if (member.error || !member.data) throw new Error("You are not in this match");
    const [tok] = await fetchPrices([data.token]);
    if (!tok) throw new Error("Couldn't get a price for that token");
    return action<{ price: number; qty: number; symbol: string }>("trade", context.userId, {
      id: data.matchId, token: data.token, side: data.side, usd: data.usd ?? null,
      closeAll: data.closeAll ?? false, price: tok.price, symbol: tok.symbol,
    });
  });

export const finishMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const match = await db.from("matches").select("status,ends_at").eq("id", data.id).maybeSingle();
    const players = await db.from("match_players").select("user_id,holdings").eq("match_id", data.id);
    if (match.error || players.error || !players.data?.some(p => p.user_id === context.userId)) throw new Error("Not in match");
    if (match.data?.status === "finished") return { ok: true };
    if (match.data?.status !== "active" || new Date(match.data.ends_at ?? 0).getTime() > Date.now()) throw new Error("Match still running");
    const addresses = [...new Set(players.data.flatMap(p => Object.keys(p.holdings as Record<string, unknown>)))];
    const tokens = addresses.length ? await fetchPrices(addresses) : [];
    if (addresses.some(a => !tokens.some(t => t.address === a))) throw new Error("Final prices unavailable; retrying settlement");
    return action<{ ok: boolean }>("finish", context.userId, { id: data.id, prices: Object.fromEntries(tokens.map(t => [t.address,t.price])) });
  });
