import { Trophy, Pizza } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable callout for the YesFam India pizza prize. Used on the Landing,
 * Dashboard, Leaderboard, and Profile pages.
 */
export function PizzaPrize({
  variant = "card",
  leaderName,
  leaderPoints,
  className,
}: {
  variant?: "card" | "banner" | "tag";
  leaderName?: string | null;
  leaderPoints?: number | null;
  className?: string;
}) {
  if (variant === "tag") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30",
          className,
        )}
        data-testid="badge-pizza-prize"
      >
        <Pizza className="w-3 h-3" /> Leading the pizza
      </span>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30",
          className,
        )}
        data-testid="banner-pizza-prize"
      >
        <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
        <p className="text-sm text-amber-100/90 font-medium">
          <span className="font-bold text-amber-300">Top scorer wins a pizza</span> from YesFam India.
          {leaderName ? (
            <span className="text-slate-300">
              {" "}Currently leading: <span className="font-semibold text-white">{leaderName}</span>
              {typeof leaderPoints === "number" ? (
                <span className="text-amber-300"> ({leaderPoints} pts)</span>
              ) : null}.
            </span>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden bg-card border border-amber-500/30 p-5 flex items-center gap-4 shadow-[0_10px_30px_rgba(191,149,63,0.12)]",
        className,
      )}
      data-testid="card-pizza-prize"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
      <Trophy
        className="w-12 h-12 text-amber-400 drop-shadow-[0_0_15px_rgba(191,149,63,0.4)] shrink-0"
        strokeWidth={1.5}
      />
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-extrabold text-amber-200 mb-0.5">Top scorer wins a pizza</h2>
        <p className="text-xs text-slate-400">
          Courtesy of <span className="text-slate-200 font-medium">YesFam India</span> — finish #1 to claim it.
        </p>
        {leaderName ? (
          <p className="text-xs mt-2 text-slate-300">
            Current leader: <span className="font-semibold text-white">{leaderName}</span>
            {typeof leaderPoints === "number" ? (
              <span className="text-amber-300"> ({leaderPoints} pts)</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
