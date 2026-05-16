import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowRight, Camera, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import {
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
  useSubmitIdentity,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { AmbientGlow } from "@/components/AmbientGlow";
import { ExitChip } from "@/components/ExitChip";

export default function VerifyIdentity() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const status = useGetMyAccountStatus({
    query: { queryKey: getGetMyAccountStatusQueryKey(), enabled: isLoggedIn },
  });
  const submit = useSubmitIdentity();
  const { uploadFile, isUploading, progress } = useUpload();
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = await uploadFile(file);
    if (r) setUploadedPath(r.objectPath);
    else toast({ title: "Upload failed", variant: "destructive" });
    e.target.value = "";
  };

  useEffect(() => {
    if (!isLoading && !isLoggedIn) setLocation("/login");
  }, [isLoading, isLoggedIn, setLocation]);

  useEffect(() => {
    if (!status.data) return;
    if (!status.data.emailVerified) setLocation("/verify-email");
    else if (status.data.paymentStatus !== "paid" && status.data.paymentStatus !== "submitted") setLocation("/payment");
  }, [status.data, setLocation]);

  const handleConfirm = async () => {
    if (!uploadedPath) return;
    try {
      await submit.mutateAsync({ data: { photoUrl: uploadedPath } });
      await status.refetch();
      toast({ title: "Selfie submitted for review" });
      setLocation("/dashboard");
    } catch (err) {
      toast({ title: "Submit failed", variant: "destructive", description: errorOf(err) });
    }
  };

  const ist = status.data?.identityStatus;
  const showPending = ist === "pending" && !uploadedPath;
  const showRejected = ist === "rejected";

  return (
    <div className="relative min-h-screen bg-background text-foreground p-4 md:p-8 flex items-start md:items-center justify-center overflow-hidden">
      <AmbientGlow />
      <ExitChip />
      <div className="relative z-10 w-full max-w-md bg-card/80 backdrop-blur-sm border border-border rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Confirm it's really you</h1>
          <p className="text-sm text-muted-foreground">
            Snap a quick selfie holding any photo ID near your face. Used by the admin to make sure
            no one's gaming the leaderboard with duplicate accounts.
          </p>
        </div>

        {showRejected && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Selfie was rejected</p>
              {status.data?.identityNotes ? (
                <p className="text-muted-foreground mt-1">{status.data.identityNotes}</p>
              ) : (
                <p className="text-muted-foreground mt-1">Please retry with better lighting.</p>
              )}
            </div>
          </div>
        )}

        {showPending ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <Clock className="w-4 h-4 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Awaiting review</p>
              <p className="text-muted-foreground">An admin will verify shortly. You can predict in the meantime.</p>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-identity-file"
            />
            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              variant="outline"
              className="w-full"
              data-testid="button-upload-selfie"
            >
              <Camera className="w-4 h-4 mr-2" />
              {isUploading
                ? `Uploading… ${progress}%`
                : uploadedPath
                  ? "Replace selfie"
                  : "Upload selfie"}
            </Button>
            {uploadedPath && (
              <p className="text-xs text-emerald-400 text-center">Selfie ready</p>
            )}
          </>
        )}

        {uploadedPath && (
          <Button
            onClick={handleConfirm}
            className="w-full"
            disabled={submit.isPending}
            data-testid="button-submit-identity"
          >
            {submit.isPending ? "Submitting…" : "Send for review"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}

        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          className="w-full text-sm text-muted-foreground hover:text-primary"
          data-testid="link-skip-identity"
        >
          Skip for now — I'll do it later
        </button>
      </div>
    </div>
  );
}

function errorOf(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data) {
    return String((err.data as { error: unknown }).error);
  }
  return "Try again in a moment.";
}
