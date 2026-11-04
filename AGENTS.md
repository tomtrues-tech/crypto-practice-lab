<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Memecoin prices come from DexScreener (src/lib/memecoins.ts) — no API key, shared by browser and server.
- Match actions run through authenticated server functions with server-fetched prices and the service-role-only duel_action RPC; it locks the match and commits each action atomically to prevent overlapping joins, trades, cancellations or settlement. Missing final prices leave settlement pending rather than inventing scores.
- Solo mode stores its portfolio in localStorage; it needs no account.
- Coin discovery combines latest and recently updated DexScreener profiles, latest/top boosts, and community takeovers without a liquidity floor; shared TokenTable categories use pair creation timestamps, not listing dates, so freshness stays factual.
- Use a shared terminal navigation shell and semantic trading variants for controls so market, solo, and match views stay visually consistent.
- Preserve the existing solo localStorage key across brand changes so returning players keep their portfolios.
