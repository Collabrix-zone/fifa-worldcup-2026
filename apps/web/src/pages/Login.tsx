import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import yesfamLogo from "@/assets/yesfam-logo.svg";

type Mode = "login" | "signup";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Sign-in expired or was tampered with. Please try again.",
  unverified_email: "Your Google email isn't verified. Verify it with Google first, then try again.",
  oauth_failed: "Google sign-in failed. Please try again.",
  access_denied: "You cancelled the Google sign-in.",
  account_conflict: "An account with this email is already linked to a different Google account. Contact an admin if you think this is wrong.",
};

export default function Login() {
  const { login, signup } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("google_error");
    if (err) {
      toast({
        title: "Google sign-in failed",
        description: GOOGLE_ERROR_MESSAGES[err] ?? err,
        variant: "destructive",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("google_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [toast]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        setLocation("/dashboard");
      } else {
        // New users always start the verification funnel
        await signup(name.trim(), email.trim(), password);
        setLocation("/verify-email");
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.data && typeof err.data === "object" && "error" in err.data
            ? String((err.data as { error: unknown }).error)
            : err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong";
      toast({ title: mode === "login" ? "Login failed" : "Signup failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

      <Link
        href="/"
        className="absolute left-4 top-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-4 text-sm font-bold text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-white sm:left-6 sm:top-6"
        data-testid="link-back-home"
        aria-label="Back to home"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_-5px_rgba(24,165,88,0.5)] p-3">
            <img src={yesfamLogo} alt="YesFam India" className="w-full h-full object-contain" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-2">
            YesFam India · Football Kickoff 2026
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-muted-foreground">
            {mode === "login"
              ? "Log in to keep predicting and climb the table."
              : "Pick a name — it's how you'll appear on the leaderboard."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
          {mode === "signup" && (
            <Input
              type="text"
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              data-testid="input-name"
              autoComplete="name"
              className="h-12"
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="input-email"
            autoComplete="email"
            className="h-12"
          />
          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "signup" ? 8 : 1}
              data-testid="input-password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="h-12"
            />
            {mode === "signup" && password.length > 0 && (() => {
              const checks = [
                { ok: password.length >= 8, label: "8+ characters" },
                { ok: /[a-z]/.test(password), label: "lowercase" },
                { ok: /[A-Z]/.test(password), label: "uppercase" },
                { ok: /[0-9]/.test(password), label: "digit" },
              ];
              const passed = checks.filter((c) => c.ok).length;
              const meterTone =
                passed >= 4 ? "bg-primary" : passed >= 3 ? "bg-amber-400" : "bg-destructive";
              return (
                <div className="pt-1">
                  <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className={cn("h-full transition-all", meterTone)}
                      style={{ width: `${(passed / 4) * 100}%` }}
                    />
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {checks.map((c) => (
                      <li
                        key={c.label}
                        className={cn("flex items-center gap-1", c.ok && "text-primary")}
                      >
                        {c.ok ? "✓" : "·"} {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
          <Button
            type="submit"
            disabled={submitting || (mode === "signup" && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password))}
            className="w-full h-12 text-base font-bold"
            data-testid="button-submit"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <a
          href="/api/auth/google/start"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 w-full h-12 rounded-md border border-border bg-card hover:bg-muted transition-colors text-sm font-semibold text-foreground"
          data-testid="button-google"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </a>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-primary font-medium hover:underline"
                data-testid="link-switch-signup"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-primary font-medium hover:underline"
                data-testid="link-switch-login"
              >
                Log in
              </button>
            </>
          )}
        </div>

      </motion.div>

      <p className="relative z-10 mt-6 text-center text-[11px] text-muted-foreground">
        Built by{" "}
        <a
          href="https://thecollabrix.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/80 hover:text-primary underline-offset-2 hover:underline transition-colors"
          data-testid="link-collabrix"
        >
          Collabrix Zone
        </a>
      </p>
    </div>
  );
}
