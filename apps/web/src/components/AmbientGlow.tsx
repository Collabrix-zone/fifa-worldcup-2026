// Ambient primary-green glow blobs used as a background accent on standalone
// pages (Landing, Login, VerifyEmail, Payment, VerifyIdentity, not-found).
// Authed pages get an equivalent treatment via AppShell.
export function AmbientGlow() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <div className="absolute left-1/2 top-[-15%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
      <div className="absolute right-[-10%] top-[40%] h-[500px] w-[500px] rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="absolute left-[-10%] bottom-[5%] h-[450px] w-[450px] rounded-full bg-primary/[0.09] blur-3xl" />
    </div>
  );
}
