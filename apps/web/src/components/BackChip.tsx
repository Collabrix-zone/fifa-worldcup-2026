// Top-left "Back" pill. Uses browser history when available, otherwise
// falls back to a sensible default (Landing/Dashboard).
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export function BackChip({ fallback = "/" }: { fallback?: string }) {
  const [, setLocation] = useLocation();
  const handle = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      setLocation(fallback);
    }
  };
  return (
    <button
      onClick={handle}
      className="absolute left-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm font-bold text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-white sm:left-6 sm:top-6"
      data-testid="button-back"
      aria-label="Go back"
      type="button"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
