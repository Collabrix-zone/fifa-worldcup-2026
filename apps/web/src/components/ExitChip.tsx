// Top-right "Sign out" pill rendered on standalone onboarding pages
// (VerifyEmail, Payment, VerifyIdentity). Gives users a clear escape
// from the verification funnel without forcing them through to the end.
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function ExitChip({ label = "Sign out" }: { label?: string }) {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const handle = () => {
    void logout()
      .catch(() => {})
      .finally(() => setLocation("/"));
  };
  return (
    <button
      onClick={handle}
      className="absolute right-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm font-bold text-muted-foreground backdrop-blur-sm transition-colors hover:border-destructive/40 hover:text-destructive sm:right-6 sm:top-6"
      data-testid="button-exit-funnel"
      aria-label={label}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      {label}
    </button>
  );
}
