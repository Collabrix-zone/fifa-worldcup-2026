import ReactMarkdown from "react-markdown";
import { ScrollText } from "lucide-react";
import { useGetTournament } from "@workspace/api-client-react";
import { TOURNAMENT_SLUG } from "@/lib/constants";

// /rules is fully admin-editable. Markdown body lives on the tournament
// row and is updated from /admin → "Tournament rules" editor. If the
// admin has never edited (empty string), we fall back to a short stub so
// the page never looks broken.
const FALLBACK_RULES = `## How points are awarded

Rules have not been published yet — the admin will fill them in shortly.`;

export default function Rules() {
  const tournament = useGetTournament(TOURNAMENT_SLUG);
  const body = (tournament.data?.rulesMd ?? "").trim() || FALLBACK_RULES;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24">
      <header className="mb-6 flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
        <ScrollText className="w-3.5 h-3.5" /> Rulebook
      </header>
      <article
        className="prose prose-invert prose-sm md:prose-base max-w-none rounded-2xl border border-border bg-card/60 p-6 md:p-10 prose-headings:text-white prose-strong:text-white prose-a:text-primary prose-code:text-primary"
        data-testid="rules-body"
      >
        <ReactMarkdown>{body}</ReactMarkdown>
      </article>
    </div>
  );
}
