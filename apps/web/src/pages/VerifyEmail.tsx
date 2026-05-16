import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useSendOtp,
  useVerifyOtp,
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { AmbientGlow } from "@/components/AmbientGlow";
import { ExitChip } from "@/components/ExitChip";

export default function VerifyEmail() {
  const { currentUser, isLoggedIn, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const status = useGetMyAccountStatus({
    query: { queryKey: getGetMyAccountStatusQueryKey(), enabled: isLoggedIn },
  });
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const [code, setCode] = useState("");
  const [autoSent, setAutoSent] = useState(false);

  // Bounce out if not logged in
  useEffect(() => {
    if (!isLoading && !isLoggedIn) setLocation("/login");
  }, [isLoading, isLoggedIn, setLocation]);

  // Skip-ahead if already verified
  useEffect(() => {
    if (status.data?.emailVerified) {
      if (status.data.paymentStatus !== "paid") setLocation("/payment");
      else if (status.data.identityStatus === "unsubmitted") setLocation("/verify-identity");
      else setLocation("/dashboard");
    }
  }, [status.data, setLocation]);

  // Auto-send the first OTP on mount
  useEffect(() => {
    if (!autoSent && status.data && !status.data.emailVerified) {
      setAutoSent(true);
      sendOtp.mutateAsync().catch(() => {});
    }
  }, [autoSent, status.data, sendOtp]);

  const handleResend = async () => {
    try {
      const r = await sendOtp.mutateAsync();
      toast({
        title: r.alreadyVerified ? "Already verified" : "Code sent",
        description: r.alreadyVerified ? "" : `Check ${currentUser?.email} for a 6-digit code.`,
      });
    } catch (err) {
      toast({ title: "Could not send code", variant: "destructive", description: errorOf(err) });
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await verifyOtp.mutateAsync({ data: { code: code.trim() } });
      await status.refetch();
      toast({ title: "Email verified" });
      setLocation("/payment");
    } catch (err) {
      toast({ title: "Verification failed", variant: "destructive", description: errorOf(err) });
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground flex items-center justify-center p-4 overflow-hidden">
      <AmbientGlow />
      <ExitChip />
      <div className="relative z-10 w-full max-w-md bg-card/80 backdrop-blur-sm border border-border rounded-3xl p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="text-white font-medium">{currentUser?.email}</span>. It expires in 15 minutes.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="text-center text-2xl tracking-[0.5em] font-bold h-14"
            data-testid="input-otp"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={code.length !== 6 || verifyOtp.isPending}
            data-testid="button-verify-otp"
          >
            {verifyOtp.isPending ? "Verifying…" : "Verify and continue"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </form>

        <div className="text-center text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-primary disabled:opacity-50"
            onClick={handleResend}
            disabled={sendOtp.isPending}
            data-testid="button-resend-otp"
          >
            {sendOtp.isPending ? "Sending…" : "Didn't get it? Resend code"}
          </button>
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
