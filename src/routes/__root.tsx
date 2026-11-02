import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { BarChart3, Swords, Wallet, Activity, ArrowUpRight, Crosshair, LogOut } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DexDuel" },
      { name: "description", content: "Paper trade real memecoins and duel other traders." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Header() {
  const { user } = useSession();
  const navigate = useNavigate();
  const qc = Route.useRouteContext().queryClient;
  const link = "flex items-center gap-2 rounded px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted";
  const active = { className: "text-primary bg-muted" };
  return (
    <header className="sticky top-0 z-20 border-b bg-background lg:fixed lg:bottom-0 lg:left-0 lg:w-48 lg:border-b-0 lg:border-r">
      <div className="flex flex-wrap items-center gap-1 px-3 py-3 lg:h-full lg:flex-col lg:items-stretch lg:gap-6 lg:py-6">
        <Link to="/" className="mr-auto flex items-center gap-2 px-2 font-display text-2xl lg:mr-0"><Crosshair className="size-6 text-primary" aria-hidden />Dex<span className="-ml-2 text-primary">Duel</span></Link>
        <span className="hidden px-3 font-mono text-[10px] text-muted-foreground lg:block">MEMECOIN PAPER TRADING</span>
        <nav aria-label="Main navigation" className="order-3 flex w-full gap-1 border-t pt-2 lg:order-none lg:flex-col lg:border-0 lg:pt-0">
          <Link to="/" activeOptions={{ exact: true }} className={link} activeProps={active}><BarChart3 className="size-4" />Market</Link>
          <Link to="/solo" className={link} activeProps={active}><Wallet className="size-4" />Solo</Link>
          <Link to="/play" className={link} activeProps={active}><Swords className="size-4" />1v1 Arena</Link>
        </nav>
        <div className="hidden flex-1 lg:block" />
        <div className="hidden border-t px-3 pt-4 text-xs text-muted-foreground lg:block"><div className="mb-2 flex items-center gap-2"><Activity className="size-3 text-primary" />Solana market</div><div>Real coins. Paper money.</div></div>
        <div>
          {user ? (
            <Button variant="ghost" className="w-full justify-start" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}><LogOut />Sign out</Button>
          ) : (
            <Button asChild variant="outline" className="w-full justify-between"><Link to="/auth">Sign in<ArrowUpRight /></Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_IN") {
        const dest = sessionStorage.getItem("postAuth");
        if (dest) { sessionStorage.removeItem("postAuth"); router.navigate({ to: dest }); }
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Header />
      <div className="min-w-0 lg:ml-48"><Outlet /></div>
    </QueryClientProvider>
  );
}
