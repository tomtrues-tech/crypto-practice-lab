import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const safe = (r?: string) => {
  if (!r) return "/play";
  try { const u = new URL(r, "http://x"); return u.pathname.startsWith("/") && !u.pathname.startsWith("//") ? u.pathname + u.search : "/play"; } catch { return "/play"; }
};

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s["redirect"] === "string" ? { redirect: s["redirect"] } : {}),
  head: () => ({
    meta: [
      { title: "Sign in — DexDuel" },
      { name: "description", content: "Sign in to battle other traders in memecoin paper-trading duels." },
      { property: "og:title", content: "Sign in — DexDuel" },
      { property: "og:description", content: "Sign in to battle other traders in memecoin duels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const dest = safe(redirect);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      if (mode === "up") {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error("Username: 3–20 letters, numbers or _");
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + dest, data: { username } } });
        if (error) throw error;
        if (!data.session) { setMsg("Check your email to confirm your account, then sign in."); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: dest });
    } catch (err) { setMsg(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const google = async () => {
    sessionStorage.setItem("postAuth", dest);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return setMsg("Google sign-in failed");
    if (r.redirected) return;
    nav({ to: dest });
  };

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="panel p-8">
        <h1 className="font-display text-3xl">{mode === "in" ? "Welcome back" : "Join the arena"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to duel other traders.</p>
        <button onClick={google} className="btn-ghost mt-6 w-full">Continue with Google</button>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && <input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full rounded-md border bg-input px-3 py-2 outline-none focus:border-primary" />}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-md border bg-input px-3 py-2 outline-none focus:border-primary" />
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-md border bg-input px-3 py-2 outline-none focus:border-primary" />
          <button disabled={busy} className="btn-primary w-full">{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</button>
        </form>
        {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-5 text-sm text-primary hover:underline">
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
