import { useEffect, useState } from "react";
import { useGetSyncStatus, getGetSyncStatusQueryKey } from "@workspace/api-client-react";
import { Wifi, WifiOff } from "lucide-react";

function formatAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SyncPill({ compact = false }: { compact?: boolean }) {
  const status = useGetSyncStatus({
    query: {
      queryKey: getGetSyncStatusQueryKey(),
      refetchInterval: 30 * 1000,
      refetchOnWindowFocus: true,
    },
  });
  // Re-render every 15s so the "Xm ago" label keeps ticking even when the
  // server hasn't pushed a new sync yet.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(id);
  }, []);

  const enabled = status.data?.pollerEnabled ?? false;
  const last = status.data?.lastScoresSyncAt ?? null;
  const fresh = last ? now - new Date(last).getTime() < 5 * 60 * 1000 : false;

  const tone = !enabled
    ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
    : fresh
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

  const label = !enabled
    ? "Auto-sync off"
    : last
      ? `Synced ${formatAgo(last, now)}`
      : "Waiting for first sync…";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border ${tone} ${compact ? "" : "shadow-sm"}`}
      title={
        status.data
          ? `Provider: ${status.data.provider}\nFixtures last synced: ${status.data.lastFixturesSyncAt ? formatAgo(status.data.lastFixturesSyncAt, now) : "never"}\nScores last synced: ${last ? formatAgo(last, now) : "never"}`
          : "Sync status"
      }
      data-testid="sync-pill"
    >
      {enabled ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      <span>{label}</span>
    </div>
  );
}
