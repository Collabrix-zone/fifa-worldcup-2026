import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Home, Trophy, BarChart3, CheckSquare, Settings, LayoutDashboard, ScrollText, User as UserIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useGetMyStats,
  useJoinTournament,
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
} from "@workspace/api-client-react";
import { Link as RouterLink } from "wouter";
import { Mail, Banknote, ShieldCheck, Clock } from "lucide-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { SyncPill } from "@/components/SyncPill";
import yesfamLogo from "@/assets/yesfam-logo.svg";

void Home;

export function AppShell({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, currentUser, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Always run the query — when not authenticated the server returns 401 and
  // the query simply errors silently. AppShell only renders for logged-in
  // users (we redirect otherwise) so this is benign during the brief loading
  // window.
  const stats = useGetMyStats({ tournamentSlug: TOURNAMENT_SLUG });
  const joinMutation = useJoinTournament();
  const accountStatus = useGetMyAccountStatus({
    query: {
      queryKey: getGetMyAccountStatusQueryKey(),
      enabled: isLoggedIn,
      refetchInterval: 60_000,
    },
  });

  useEffect(() => {
    if (!isLoading && !isLoggedIn && location !== "/" && location !== "/login") {
      setLocation("/login");
    }
  }, [isLoading, isLoggedIn, location, setLocation]);

  // Auto-join the default tournament so authenticated users immediately
  // see leaderboards and can submit predictions.
  useEffect(() => {
    if (
      isLoggedIn &&
      stats.data &&
      !stats.data.isParticipant &&
      !joinMutation.isPending &&
      !joinMutation.isSuccess
    ) {
      joinMutation
        .mutateAsync({ slug: TOURNAMENT_SLUG })
        .then(() => {
          toast({ title: "You're in! Welcome to Football Kickoff 2026." });
          void stats.refetch();
        })
        .catch(() => {
          /* swallow — user can still browse */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, stats.data?.isParticipant]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  const isAdmin = currentUser?.role === "admin";
  // Admins don't play, so no Predict tab for them. Predict route is also
  // gated server-side on payment status (admins are flagged paid for
  // backend convenience but the UI hides the entry point anyway).
  const navItems = isAdmin
    ? [
        { name: "Admin", href: "/admin", icon: Settings },
        { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
        { name: "Results", href: "/results", icon: BarChart3 },
        { name: "Rules", href: "/rules", icon: ScrollText },
      ]
    : [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Predict", href: "/predictions", icon: CheckSquare },
        { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
        { name: "Results", href: "/results", icon: BarChart3 },
        { name: "Rules", href: "/rules", icon: ScrollText },
      ];

  const points = stats.data?.totalPoints ?? 0;

  // Verification + payment banner shown above page content. Severities:
  //  * email unverified  → strong CTA, blocks predictions
  //  * payment unpaid    → strong CTA, blocks predictions
  //  * payment submitted → soft "awaiting review" pill
  //  * identity pending  → soft pill (doesn't block)
  const acc = accountStatus.data;
  const banner = (() => {
    if (!acc) return null;
    if (acc.banned) {
      return {
        href: "/profile",
        icon: ShieldCheck,
        tone: "danger" as const,
        title: "Your account is banned",
        body: acc.banReason ? `Reason: ${acc.banReason}` : "Contact an admin if this looks wrong.",
        cta: "Details",
      };
    }
    if (!acc.emailVerified) {
      return {
        href: "/verify-email",
        icon: Mail,
        tone: "warn" as const,
        title: "Verify your email",
        body: "Confirm your email to unlock predictions.",
        cta: "Verify now",
      };
    }
    if (acc.paymentStatus === "unpaid" || acc.paymentStatus === "rejected") {
      return {
        href: "/payment",
        icon: Banknote,
        tone: "warn" as const,
        title: acc.paymentStatus === "rejected" ? "Payment was rejected" : "Pay the entry fee",
        body: "Predictions unlock the moment an admin approves your payment.",
        cta: "Pay now",
      };
    }
    if (acc.paymentStatus === "submitted") {
      return {
        href: "/payment",
        icon: Clock,
        tone: "info" as const,
        title: "Payment under review",
        body: "An admin will approve you shortly. You can browse in the meantime.",
        cta: "View",
      };
    }
    if (acc.identityStatus === "unsubmitted") {
      return {
        href: "/verify-identity",
        icon: ShieldCheck,
        tone: "info" as const,
        title: "Add a selfie for verification",
        body: "Optional but helps the admin keep the league fair.",
        cta: "Upload",
      };
    }
    return null;
  })();

  return (
    <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden">
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card h-full">
        <div className="p-6 pb-3">
          <div className="flex items-center gap-3">
            <img src={yesfamLogo} alt="YesFam India" className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary leading-tight">
                YesFam India
              </p>
              <h1 className="text-base font-extrabold tracking-tight text-white leading-tight">
                Football Kickoff 2026
              </h1>
            </div>
          </div>
          <div className="mt-3">
            <SyncPill />
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white",
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border shrink-0">
          <Link href="/profile" className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer mb-2">
            <Avatar className="w-10 h-10 border border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary">
                {currentUser?.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 overflow-hidden">
              <span className="text-sm font-medium truncate">{currentUser?.name}</span>
              <span className="text-xs text-muted-foreground truncate">{points} pts</span>
            </div>
          </Link>
          <button
            onClick={() => {
              void logout().then(() => setLocation("/"));
            }}
            className="flex w-full items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
          <p className="mt-3 px-2 text-[10px] text-muted-foreground/70 text-center">
            Built by{" "}
            <a
              href="https://thecollabrix.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-primary transition-colors"
              data-testid="link-collabrix-sidebar"
            >
              Collabrix Zone
            </a>
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0 relative overflow-hidden">
        {/* Ambient primary-green glow background (matches Landing/Login theme) */}
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-15%] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-[-15%] top-[35%] h-[500px] w-[500px] rounded-full bg-primary/[0.06] blur-3xl" />
          <div className="absolute left-[-15%] bottom-[5%] h-[450px] w-[450px] rounded-full bg-primary/[0.08] blur-3xl" />
        </div>
        <div className="relative z-10 md:hidden flex justify-end px-4 pt-3">
          <SyncPill compact />
        </div>
        <div className="relative z-10 flex-1 overflow-y-auto">
          {banner && (
            <div className="px-4 md:px-8 pt-4">
              <RouterLink
                href={banner.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                  banner.tone === "danger"
                    ? "bg-destructive/15 border-destructive/40 hover:bg-destructive/20"
                    : banner.tone === "warn"
                      ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15"
                      : "bg-primary/10 border-primary/30 hover:bg-primary/15",
                )}
                data-testid={`banner-${banner.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <banner.icon
                  className={cn(
                    "w-5 h-5 shrink-0",
                    banner.tone === "danger"
                      ? "text-destructive"
                      : banner.tone === "warn"
                        ? "text-amber-400"
                        : "text-primary",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{banner.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{banner.body}</p>
                </div>
                <span className="text-xs font-semibold text-primary shrink-0 hidden sm:inline">{banner.cta} →</span>
              </RouterLink>
            </div>
          )}
          {children}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex justify-around items-center h-16 px-2 safe-area-bottom">
        {(isAdmin
          ? [
              { name: "Admin", href: "/admin", icon: Settings },
              { name: "Board", href: "/leaderboard", icon: Trophy },
              { name: "Results", href: "/results", icon: BarChart3 },
              { name: "Profile", href: "/profile", icon: UserIcon },
            ]
          : [
              { name: "Home", href: "/dashboard", icon: LayoutDashboard },
              { name: "Predict", href: "/predictions", icon: CheckSquare },
              { name: "Board", href: "/leaderboard", icon: Trophy },
              { name: "Results", href: "/results", icon: BarChart3 },
              { name: "Profile", href: "/profile", icon: UserIcon },
            ]
        ).map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "fill-primary/20" : "")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
