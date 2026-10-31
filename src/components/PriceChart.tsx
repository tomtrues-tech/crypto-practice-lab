import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const FRAMES = [
  { k: "LIVE", days: 0 },
  { k: "1D", days: 1 },
  { k: "7D", days: 7 },
  { k: "1M", days: 30 },
  { k: "3M", days: 90 },
  { k: "1Y", days: 365 },
] as const;
type Frame = (typeof FRAMES)[number]["k"];
type Pt = { t: number; p: number };

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });

function simulate(base: number, n: number, span: number): Pt[] {
  const now = Date.now();
  let p = base;
  const out: Pt[] = [];
  for (let i = n; i >= 0; i--) {
    out.unshift({ t: now - (span / n) * (n - i), p });
    p = p * (1 + (Math.random() - 0.5) * 0.02);
  }
  return out.reverse().map((x, i, a) => ({ t: a[a.length - 1 - i]!.t, p: x.p })).sort((a, b) => a.t - b.t);
}

export function PriceChart({ id, name, symbol, price }: { id: string; name: string; symbol: string; price: number }) {
  const [frame, setFrame] = useState<Frame>("1D");
  const [data, setData] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const days = FRAMES.find((f) => f.k === frame)!.days;
    if (frame === "LIVE") {
      setData([{ t: Date.now(), p: price }]);
      setLoading(false);
      const tick = async () => {
        let p = 0;
        try {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
          p = (await r.json())[id]?.usd ?? 0;
        } catch {}
        if (!alive) return;
        setData((d) => {
          const last = d[d.length - 1]?.p ?? price;
          const np = p || last * (1 + (Math.random() - 0.5) * 0.002);
          return [...d, { t: Date.now(), p: np }].slice(-120);
        });
      };
      const iv = setInterval(tick, 5000);
      return () => { alive = false; clearInterval(iv); };
    }
    (async () => {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
        if (!r.ok) throw 0;
        const j = await r.json();
        if (alive) setData(j.prices.map(([t, p]: [number, number]) => ({ t, p })));
      } catch {
        if (alive) setData(simulate(price, 120, days * 86400000));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, frame]);

  const first = data[0]?.p ?? 0;
  const last = data[data.length - 1]?.p ?? price;
  const ch = first ? ((last - first) / first) * 100 : 0;
  const up = ch >= 0;
  const color = up ? "var(--gain)" : "var(--loss)";
  const fmt = (t: number) =>
    frame === "LIVE" || frame === "1D"
      ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{name} · {symbol}/USD</div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-semibold">{usd(last)}</span>
            <span className={`font-mono text-sm ${up ? "text-gain" : "text-loss"}`}>
              {up ? "+" : ""}{ch.toFixed(2)}% <span className="text-muted-foreground">{frame}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {FRAMES.map((f) => (
            <button
              key={f.k}
              onClick={() => setFrame(f.k)}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-semibold transition ${frame === f.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f.k === "LIVE" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />}
              {f.k}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chart…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tickFormatter={fmt} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={["auto", "auto"]} orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => usd(v)} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-mono)" }}
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v) => [usd(v as number), "Price"]}
              />
              <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill="url(#fill)" isAnimationActive={frame !== "LIVE"} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {frame === "LIVE" && <p className="mt-2 text-xs text-muted-foreground">Updates every 5 seconds.</p>}
    </div>
  );
}
