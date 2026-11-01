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
- Match trades/scoring run only in server functions (src/lib/match.functions.ts) with server-fetched prices; match tables have no client write policies, so players can't fake trades.
- Solo mode stores its portfolio in localStorage; it needs no account.
