// Verified players (payment approved by admin) get a join link to the
// community WhatsApp group. Rendered on Dashboard + Profile when the
// user has been approved. Hidden for unverified, banned, and admin users.
import { ExternalLink, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  useGetMyAccountStatus,
  getGetMyAccountStatusQueryKey,
} from "@workspace/api-client-react";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HHLo2T9IKUGFZKf8KcnrtS?mode=gi_t";

export function CommunityChatCard({ compact = false }: { compact?: boolean }) {
  const { isLoggedIn, currentUser } = useAuth();
  const status = useGetMyAccountStatus({
    query: { queryKey: getGetMyAccountStatusQueryKey(), enabled: isLoggedIn },
  });

  if (!isLoggedIn) return null;
  if (currentUser?.role === "admin") return null;
  if (!status.data) return null;
  if (status.data.banned) return null;
  // Only show once the admin has approved the player's payment — that is
  // the "verified" state the brief refers to.
  if (status.data.paymentStatus !== "paid") return null;

  if (compact) {
    return (
      <a
        href={WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20"
        data-testid="link-whatsapp-compact"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Join the chat
        <ExternalLink className="h-3 w-3 opacity-70" />
      </a>
    );
  }

  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-5 transition-colors hover:border-primary/50"
      data-testid="card-whatsapp-group"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
        <MessageCircle className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold tracking-tight text-white">
          You're in — join the WhatsApp group
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Match banter, predictions, and pizza politics with the rest of the crew.
        </p>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}
