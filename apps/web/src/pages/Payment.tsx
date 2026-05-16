import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Banknote, CheckCircle2, ArrowRight, Clock, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@workspace/object-storage-web";
import {
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
  useSubmitPayment,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { AmbientGlow } from "@/components/AmbientGlow";
import { BackChip } from "@/components/BackChip";

export default function Payment() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const status = useGetMyAccountStatus({
    query: { queryKey: getGetMyAccountStatusQueryKey(), enabled: isLoggedIn },
  });
  const submit = useSubmitPayment();
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
    else if (status.data.paymentStatus === "paid") {
      if (status.data.identityStatus === "unsubmitted") setLocation("/verify-identity");
      else setLocation("/dashboard");
    }
  }, [status.data, setLocation]);

  const settings = status.data?.paymentSettings;
  const fee = settings?.entryFeeAmount ?? 100;
  const currency = settings?.entryFeeCurrency ?? "INR";
  const upiId = settings?.upiId ?? "yesfam@upi";
  const upiName = settings?.upiDisplayName ?? "YesFam India";
  const qrUrl = settings?.qrCodeUrl;

  const handleConfirm = async () => {
    if (!uploadedPath) return;
    try {
      await submit.mutateAsync({ data: { screenshotUrl: uploadedPath } });
      await status.refetch();
      toast({ title: "Payment submitted for review" });
      setLocation("/verify-identity");
    } catch (err) {
      toast({ title: "Submit failed", variant: "destructive", description: errorOf(err) });
    }
  };

  const ps = status.data?.paymentStatus;
  const showSubmittedState = ps === "submitted" && !uploadedPath;
  const showRejectedNote = ps === "rejected";

  return (
    <div className="relative min-h-screen bg-background text-foreground p-4 md:p-8 flex items-start md:items-center justify-center overflow-hidden">
      <AmbientGlow />
      <BackChip fallback="/dashboard" />
      <div className="relative z-10 w-full max-w-2xl bg-card/80 backdrop-blur-sm border border-border rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Banknote className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pay the entry fee</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Send <span className="text-white font-bold">{currency} {fee}</span> via UPI to{" "}
            <span className="text-white font-bold">{upiName}</span>, then upload the screenshot. An admin
            will approve you within a few hours.
          </p>
        </div>

        {showRejectedNote && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Last payment was rejected</p>
              {status.data?.paymentNotes ? (
                <p className="text-muted-foreground mt-1">{status.data.paymentNotes}</p>
              ) : (
                <p className="text-muted-foreground mt-1">Please re-upload a clearer screenshot.</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="bg-background border border-border rounded-xl p-5 flex flex-col items-center text-center">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="UPI QR code"
                className="w-44 h-44 rounded-lg border border-border bg-white object-contain p-2"
                data-testid="img-upi-qr"
              />
            ) : (
              <div className="w-44 h-44 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground p-3 text-center">
                QR code not uploaded yet — pay using the UPI ID below.
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">UPI ID</p>
            <p className="text-sm font-mono font-bold text-white" data-testid="text-upi-id">{upiId}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">After paying, upload your screenshot:</p>

            {showSubmittedState ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
                <Clock className="w-4 h-4 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-200">Awaiting admin approval</p>
                  <p className="text-muted-foreground">You'll be unlocked once an admin reviews it.</p>
                </div>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-payment-file"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                  data-testid="button-upload-screenshot"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading
                    ? `Uploading… ${progress}%`
                    : uploadedPath
                      ? "Replace screenshot"
                      : "Upload screenshot"}
                </Button>
              </>
            )}

            {uploadedPath && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Screenshot ready
              </div>
            )}

            <Button
              onClick={handleConfirm}
              className="w-full"
              disabled={!uploadedPath || submit.isPending}
              data-testid="button-submit-payment"
            >
              {submit.isPending ? "Submitting…" : "Submit for review"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              Honor system — you can browse the leaderboard now, but predictions unlock only after approval.
            </p>
          </div>
        </div>
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
