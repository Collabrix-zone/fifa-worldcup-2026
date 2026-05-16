import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  useListAdminUsers,
  useBanUser,
  useUnbanUser,
  useSetUserName,
  getListAdminUsersQueryKey,
  ApiError,
  type AdminUserRow,
} from "@workspace/api-client-react";
import { Users, Mail, Ban, RotateCcw, Edit3 } from "lucide-react";

export default function AdminUsers() {
  const { currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const users = useListAdminUsers({ tournamentSlug: TOURNAMENT_SLUG });

  // Same guard the Admin page uses — non-admins get kicked back to the
  // public dashboard. Server-side admin endpoints reject non-admins too,
  // this just avoids rendering an empty shell.
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      setLocation("/dashboard");
    }
  }, [currentUser, setLocation]);

  if (!currentUser || currentUser.role !== "admin") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-24"
      data-testid="page-admin-users"
    >
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
          User management
        </p>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
          Players & admins
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Every account in the system. Edit display names, ban or unban
          players, and review participation. Admins are hidden from the
          public leaderboard automatically.
        </p>
      </header>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="w-4 h-4 text-blue-400" />
            Registered users
          </div>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {users.data?.length ?? 0} total
          </span>
        </div>
        <UsersTable
          rows={users.data ?? []}
          loading={users.isLoading}
          currentUserId={currentUser.id}
        />
      </section>
    </motion.div>
  );
}

function UsersTable({
  rows,
  loading,
  currentUserId,
}: {
  rows: AdminUserRow[];
  loading: boolean;
  currentUserId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const setUserName = useSetUserName();

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminUsersQueryKey({ tournamentSlug: TOURNAMENT_SLUG }),
    });

  async function handleBan(userId: number, name: string) {
    const reason = window.prompt(`Reason for banning ${name}?`);
    if (!reason || !reason.trim()) return;
    try {
      await banUser.mutateAsync({ id: userId, data: { reason: reason.trim() } });
      toast({ title: `${name} banned` });
      await refresh();
    } catch (err) {
      toast({
        title: "Ban failed",
        variant: "destructive",
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }
  async function handleUnban(userId: number, name: string) {
    try {
      await unbanUser.mutateAsync({ id: userId });
      toast({ title: `${name} unbanned` });
      await refresh();
    } catch (err) {
      toast({
        title: "Unban failed",
        variant: "destructive",
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }
  async function handleRename(userId: number, current: string) {
    const next = window.prompt(`Set display name for ${current}:`, current);
    if (!next || !next.trim() || next.trim() === current) return;
    try {
      await setUserName.mutateAsync({ id: userId, data: { name: next.trim() } });
      toast({ title: `Renamed to ${next.trim()}` });
      await refresh();
    } catch (err) {
      toast({
        title: "Rename failed",
        variant: "destructive",
        description: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        Loading users…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        No users yet.
      </div>
    );
  }

  // Newest first so admins see fresh signups at the top.
  const sorted = rows
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Joined</th>
              <th className="text-right px-4 py-3">Predictions</th>
              <th className="text-right px-4 py-3">Points</th>
              <th className="text-right px-4 py-3">Signed up</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((u) => (
              <tr
                key={u.id}
                className={cn(
                  "hover:bg-white/[0.02] transition-colors",
                  u.id === currentUserId && "bg-primary/5",
                )}
                data-testid={`admin-user-row-${u.id}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="text-[9px] font-bold bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded uppercase">
                            you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  <ParticipantBadge isParticipant={u.isParticipant} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-white">
                  {u.predictionsSubmitted}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                  {u.totalPoints}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                  {new Date(u.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRename(u.id, u.name)}
                      title="Edit display name"
                      className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                      disabled={setUserName.isPending || u.role === "admin"}
                      data-testid={`btn-rename-${u.id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {u.banned ? (
                      <button
                        type="button"
                        onClick={() => handleUnban(u.id, u.name)}
                        title={`Unban (was: ${u.banReason ?? "no reason"})`}
                        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                        disabled={unbanUser.isPending}
                        data-testid={`btn-unban-${u.id}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBan(u.id, u.name)}
                        title="Ban user"
                        className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                        disabled={banUser.isPending || u.id === currentUserId || u.role === "admin"}
                        data-testid={`btn-ban-${u.id}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {sorted.map((u) => (
          <div
            key={u.id}
            className={cn("p-4 space-y-2", u.id === currentUserId && "bg-primary/5")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="text-[9px] font-bold bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded uppercase">
                      you
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <RoleBadge role={u.role} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {u.predictionsSubmitted} picks · {u.totalPoints} pts
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRename(u.id, u.name)}
                  className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
                  disabled={setUserName.isPending || u.role === "admin"}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                {u.banned ? (
                  <button
                    type="button"
                    onClick={() => handleUnban(u.id, u.name)}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                    disabled={unbanUser.isPending}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleBan(u.id, u.name)}
                    className="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                    disabled={banUser.isPending || u.id === currentUserId || u.role === "admin"}
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: "user" | "admin" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        role === "admin"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {role}
    </span>
  );
}

function ParticipantBadge({ isParticipant }: { isParticipant: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        isParticipant
          ? "border-green-500/40 bg-green-500/10 text-green-300"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {isParticipant ? "Joined" : "Not joined"}
    </span>
  );
}
