import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  ShieldCheck,
  Camera,
  LogOut,
  Edit3,
  Mail,
  Banknote,
  Clock,
  AlertTriangle,
  Pizza,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGetMyStats,
  useUpdateMyProfile,
  useGetLeaderboard,
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
  useUpdateMyAvatar,
  ApiError,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { TOURNAMENT_SLUG } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { PizzaPrize } from "@/components/PizzaPrize";
import { CommunityChatCard } from "@/components/CommunityChatCard";

export default function Profile() {
  const { currentUser, logout, refresh, isLoggedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const stats = useGetMyStats({ tournamentSlug: TOURNAMENT_SLUG });
  const lb = useGetLeaderboard(TOURNAMENT_SLUG, { filter: "overall" });
  const status = useGetMyAccountStatus({
    query: { queryKey: getGetMyAccountStatusQueryKey(), enabled: isLoggedIn },
  });
  const updateProfile = useUpdateMyProfile();
  const updateAvatar = useUpdateMyAvatar();
  const { uploadFile, isUploading } = useUpload();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({ data: { name: name.trim() } });
      await refresh();
      toast({ title: "Profile updated" });
      setEditing(false);
    } catch (err) {
      toast({ title: "Update failed", description: errorOf(err), variant: "destructive" });
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const r = await uploadFile(file);
    if (!r) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }
    try {
      await updateAvatar.mutateAsync({ data: { photoUrl: r.objectPath } });
      await status.refetch();
      toast({ title: "Profile photo updated" });
    } catch (err) {
      toast({ title: "Could not save photo", description: errorOf(err), variant: "destructive" });
    }
  };

  const entries = lb.data ?? [];
  const myEntry = entries.find((e) => e.userId === currentUser?.id);
  const myRank = myEntry?.rank ?? null;
  const totalPlayers = entries.length;
  const leader = entries[0];
  const isLeader = !!myEntry && !!leader && myEntry.userId === leader.userId;
  const totalPoints = stats.data?.totalPoints ?? 0;
  const exact = stats.data?.exactScores ?? 0;
  const correct = stats.data?.correctResults ?? 0;
  const submitted = stats.data?.predictionsSubmitted ?? 0;
  // FIFA-style OVR: clamp 50–99 based on points-per-prediction scaled.
  const ovr = Math.max(50, Math.min(99, 50 + Math.round(totalPoints / 2) + (myRank ? Math.max(0, 20 - myRank) : 0)));
  const initials = (currentUser?.name ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const avatarUrl = status.data?.avatarUrl;

  return (
    <div className="min-h-full bg-[#0B101E] text-slate-100 pb-20 selection:bg-primary selection:text-black">
      <style dangerouslySetInnerHTML={{ __html: `
        .pf-display { font-family: 'Teko', 'Inter', sans-serif; letter-spacing: 0.02em; }
        .pf-card-bg {
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .pf-gold {
          background: linear-gradient(to right, #bf953f, #fcf6ba, #b38728, #fbf5b7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      ` }} />

      <div className="max-w-5xl mx-auto px-4 pt-8 md:pt-12 flex flex-col items-center">
        {/* HERO PLAYER CARD */}
        <div className="relative w-full max-w-sm shrink-0 mb-10 group">
          <div className="relative z-10 w-full rounded-[2rem] overflow-hidden p-1 pf-card-bg">
            <div className="relative bg-[#0F172A] rounded-[1.8rem] overflow-hidden p-6 flex flex-col items-center">
              <div className="w-full flex justify-between items-start absolute top-6 left-0 px-6">
                <div className="flex flex-col items-center">
                  <span className="pf-display text-5xl leading-none text-white font-bold drop-shadow-md">{ovr}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">OVR</span>
                </div>
                <div className="flex flex-col items-center gap-1 bg-slate-900/80 p-1.5 rounded-lg border border-slate-700/50">
                  {status.data?.emailVerified ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-slate-600" />
                  )}
                  {status.data?.identityStatus === "verified" ? (
                    <ShieldCheck className="w-4 h-4 text-primary" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-slate-600" />
                  )}
                </div>
              </div>

              <div className="relative mt-4 mb-4">
                <div className="w-44 h-44 rounded-full overflow-hidden border-4 border-primary shadow-[0_0_30px_hsl(var(--primary)/0.3)] bg-slate-800 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={currentUser?.name ?? ""} className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-5xl font-extrabold text-primary">{initials}</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  data-testid="input-avatar-file"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading || updateAvatar.isPending}
                  className="absolute bottom-2 right-2 bg-slate-800 border border-slate-600 text-white p-2 rounded-full hover:bg-slate-700 transition-colors shadow-lg disabled:opacity-50"
                  data-testid="button-upload-avatar"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              <h1 className="pf-display text-4xl text-white font-bold uppercase tracking-wide text-center" data-testid="text-profile-name">
                {currentUser?.name}
              </h1>
              <p className="text-sm text-slate-400 mb-4 uppercase tracking-widest font-semibold">
                {myRank ? `Rank #${myRank} of ${totalPlayers}` : `Joined`}
              </p>

              <div className="w-full grid grid-cols-2 gap-x-6 gap-y-2 pt-4 border-t border-slate-800">
                <Stat label="EXC" value={exact} />
                <Stat label="RES" value={correct} />
                <Stat label="GDF" value={stats.data?.goalDifferenceHits ?? 0} />
                <Stat label="TOT" value={totalPoints} />
              </div>

              <div className="w-16 h-1 bg-primary mx-auto mt-5 opacity-50 rounded-full" />
            </div>
          </div>
          <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 to-blue-500/30 blur-2xl -z-10 rounded-full opacity-50 mix-blend-screen group-hover:opacity-75 transition-opacity duration-700" />
        </div>

        {/* BELOW CARD */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 flex flex-col gap-6">
            {/* Pizza prize spotlight */}
            <PizzaPrize
              variant="card"
              leaderName={leader?.displayName ?? null}
              leaderPoints={leader?.totalPoints ?? null}
              className={isLeader ? "ring-2 ring-amber-400/60" : undefined}
            />
            {isLeader && (
              <div className="flex items-center gap-2 text-sm text-amber-200 -mt-3 px-4">
                <Pizza className="w-4 h-4 shrink-0" />
                You're currently #1 — keep predicting to lock in the pizza.
              </div>
            )}

            <CommunityChatCard />

            {/* Verification status block */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-3">
              <h3 className="pf-display text-2xl text-white uppercase tracking-wide">Account verification</h3>
              <StatusRow
                icon={Mail}
                label="Email"
                state={
                  status.data?.emailVerified
                    ? { kind: "ok", text: "Verified" }
                    : { kind: "warn", text: "Not verified", href: "/verify-email" }
                }
              />
              <StatusRow
                icon={Banknote}
                label="Entry fee"
                state={paymentRow(status.data?.paymentStatus, status.data?.paymentNotes)}
              />
              <StatusRow
                icon={ShieldCheck}
                label="Identity"
                state={identityRow(status.data?.identityStatus, status.data?.identityNotes)}
              />
            </div>
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 space-y-3">
              <h3 className="pf-display text-2xl text-white uppercase tracking-wide">Activity</h3>
              <SideStat label="Predictions submitted" value={submitted} />
              <SideStat label="Pending predictions" value={stats.data?.pendingPredictions ?? 0} />
              <SideStat label="Total points" value={totalPoints} highlight />
            </div>

            <div className="bg-slate-900/40 rounded-2xl border border-slate-800 p-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Account</h4>
              <div className="flex flex-col gap-2">
                {editing ? (
                  <div className="flex flex-col gap-2 p-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Display name"
                      data-testid="input-edit-name"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSave}
                        disabled={updateProfile.isPending || !name.trim()}
                        className="flex-1"
                        data-testid="button-save-profile"
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => { setEditing(false); setName(currentUser?.name ?? ""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : status.data?.displayNameLocked ? (
                  <div
                    className="flex items-center gap-2 w-full justify-start px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                    data-testid="locked-display-name"
                    title="Display name is locked. Contact an admin to change it."
                  >
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Display name locked. Contact an admin to change.
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
                    data-testid="button-edit-profile"
                  >
                    <Edit3 className="w-4 h-4 mr-2" /> Edit Display Name
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => { void logout().then(() => setLocation("/")); }}
                  className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  data-testid="button-logout-profile"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="pf-display text-2xl font-bold text-white">{value}</span>
      <span className="text-xs text-slate-400 font-semibold tracking-wider">{label}</span>
    </div>
  );
}

function SideStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={highlight ? "pf-display text-xl text-primary font-bold" : "text-white font-semibold"}>{value}</span>
    </div>
  );
}

type RowState =
  | { kind: "ok"; text: string }
  | { kind: "warn"; text: string; href?: string; sub?: string }
  | { kind: "info"; text: string; sub?: string };

function StatusRow({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof Mail;
  label: string;
  state: RowState;
}) {
  const tone =
    state.kind === "ok"
      ? "text-primary"
      : state.kind === "warn"
        ? "text-amber-400"
        : "text-slate-300";
  const dot =
    state.kind === "ok"
      ? <CheckCircle2 className={`w-4 h-4 ${tone}`} />
      : state.kind === "warn"
        ? <AlertTriangle className={`w-4 h-4 ${tone}`} />
        : <Clock className={`w-4 h-4 ${tone}`} />;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/60">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-slate-400 truncate">
          {"sub" in state && state.sub ? state.sub : state.text}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {dot}
        <span className={`text-xs font-bold ${tone}`}>{state.text}</span>
        {state.kind === "warn" && state.href && (
          <a href={state.href} className="text-xs underline text-primary hover:opacity-80">Fix</a>
        )}
      </div>
    </div>
  );
}

function paymentRow(s: string | undefined, notes: string | null | undefined): RowState {
  if (s === "paid") return { kind: "ok", text: "Approved" };
  if (s === "submitted") return { kind: "info", text: "In review", sub: "Admin will approve shortly" };
  if (s === "rejected") return { kind: "warn", text: "Rejected", href: "/payment", sub: notes ?? "Re-upload screenshot" };
  return { kind: "warn", text: "Unpaid", href: "/payment", sub: "Predictions are locked until paid" };
}

function identityRow(s: string | undefined, notes: string | null | undefined): RowState {
  if (s === "verified") return { kind: "ok", text: "Verified" };
  if (s === "pending") return { kind: "info", text: "In review" };
  if (s === "rejected") return { kind: "warn", text: "Rejected", href: "/verify-identity", sub: notes ?? "Try again" };
  return { kind: "warn", text: "Optional", href: "/verify-identity", sub: "Add a selfie when you have a moment" };
}

function errorOf(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data) {
    return String((err.data as { error: unknown }).error);
  }
  return "Try again in a moment.";
}
