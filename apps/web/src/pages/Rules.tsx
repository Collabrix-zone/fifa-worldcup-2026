import { motion } from "framer-motion";
import {
  ScrollText,
  Trophy,
  Target,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
  Award,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_RULES = [
  {
    points: 7,
    title: "Exact Score",
    desc: "You predicted the exact final score.",
    example: "You predict 2–1. Actual is 2–1.",
    tone: "green",
    Icon: Trophy,
  },
  {
    points: 5,
    title: "Correct Result + Goal Difference",
    desc: "You picked the right winner and the exact goal difference, but missed the exact score. Also applies to correct draws (e.g. you predicted 1–1, actual was 2–2).",
    example: "You predict 2–0 (+2). Actual is 3–1 (+2).",
    tone: "blue",
    Icon: Target,
  },
  {
    points: 3,
    title: "Correct Result",
    desc: "You picked the right winner, but missed the exact score and goal difference.",
    example: "You predict 1–0. Actual is 3–0.",
    tone: "yellow",
    Icon: CheckCircle2,
  },
  {
    points: 1,
    title: "One Team Score Correct",
    desc: "You predicted the wrong result, but guessed exactly how many goals one team would score.",
    example: "You predict 2–1 (Team A wins). Actual is 0–1 (Team B wins, but you got Team B's score right).",
    tone: "muted",
    Icon: TrendingUp,
  },
  {
    points: 0,
    title: "Wrong Prediction",
    desc: "You missed the result entirely and didn't get any team's exact score.",
    example: "You predict 2–0. Actual is 0–2.",
    tone: "red",
    Icon: AlertCircle,
  },
] as const;

const KO_RULES = [
  {
    points: 2,
    title: "Extra Time score",
    desc: "Awarded only if (a) you submitted an ET prediction, (b) the match actually went to extra time or penalties, and (c) your ET score matches the official end-of-ET score.",
    example: "You predict 1–1 in ET. Match ends 1–1 after ET (then to pens). +2.",
  },
  {
    points: 3,
    title: "Penalty shootout winner",
    desc: "Awarded only if (a) you submitted a penalty prediction, (b) the match went to a shootout, and (c) you picked the correct winner of the shootout (the side of the pen-difference).",
    example: "You predict 5–4 pens (Team A wins shootout). Actual: 4–2 pens, Team A wins. +3.",
  },
] as const;

const NOTES = [
  {
    Icon: Lock,
    title: "Auto-lock 15 minutes before kickoff",
    body: "Predictions close automatically. The countdown is shown on every match card.",
  },
  {
    Icon: Trophy,
    title: "Base scoring uses the 90-minute result",
    body: "Even in knockouts. Extra time and penalties are display-only for the main score and only count for the ET / pen bonuses below.",
  },
  {
    Icon: Sparkles,
    title: "Live scores sync every 2 minutes",
    body: "From the official feed — including extra time and penalty shootouts. There is no manual result entry.",
  },
  {
    Icon: Award,
    title: "Tiebreak: most Exact Scores wins",
    body: "If two players are level on points, the one with more Exact Score predictions ranks higher.",
  },
] as const;

const TONE_MAP = {
  green: {
    badge: "bg-green-500/15 text-green-400 border-green-500/30",
    border: "border-green-500/30",
    ring: "from-green-500/10 to-transparent",
    iconBg: "bg-green-500/10 text-green-400",
  },
  blue: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    border: "border-blue-500/30",
    ring: "from-blue-500/10 to-transparent",
    iconBg: "bg-blue-500/10 text-blue-400",
  },
  yellow: {
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    border: "border-yellow-500/30",
    ring: "from-yellow-500/10 to-transparent",
    iconBg: "bg-yellow-500/10 text-yellow-400",
  },
  muted: {
    badge: "bg-muted/40 text-muted-foreground border-border",
    border: "border-border",
    ring: "from-white/5 to-transparent",
    iconBg: "bg-background text-muted-foreground border border-border",
  },
  red: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    border: "border-red-500/30",
    ring: "from-red-500/10 to-transparent",
    iconBg: "bg-red-500/10 text-red-400",
  },
} as const;

type Tone = keyof typeof TONE_MAP;

export default function Rules() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-10 pb-24">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-background p-6 md:p-8"
      >
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider mb-2">
              <ScrollText className="w-3.5 h-3.5" /> Rulebook
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              How points are awarded
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm">
              Football Kickoff 2026 uses a <strong className="text-white">7 / 5 / 3 / 1 / 0</strong> base
              scheme on the 90-minute result, with optional <strong className="text-white">+2</strong>{" "}
              and <strong className="text-white">+3</strong> bonuses for nailing extra time or the
              penalty shootout.
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2 md:w-[420px]">
            {[7, 5, 3, 1, 0].map((p, idx) => (
              <div
                key={p}
                className={cn(
                  "rounded-xl border text-center py-3",
                  idx === 0
                    ? "border-green-500/40 bg-green-500/10"
                    : "border-border bg-background/50",
                )}
              >
                <p
                  className={cn(
                    "text-xs uppercase tracking-wider text-muted-foreground font-semibold",
                  )}
                >
                  {idx === 0 ? "Top" : `+${p}`}
                </p>
                <p
                  className={cn(
                    "text-2xl font-extrabold font-mono mt-0.5",
                    idx === 0 ? "text-green-400" : "text-white",
                  )}
                >
                  {p}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Base scoring */}
      <section>
        <SectionHeader
          eyebrow="Base scoring"
          title="Regulation result · 90 minutes"
          subtitle="The headline scheme. Compared against the official 90-minute final score."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BASE_RULES.map((rule, i) => (
            <RuleCard key={rule.title} {...rule} index={i} />
          ))}
        </div>
      </section>

      {/* Knockout bonuses */}
      <section>
        <SectionHeader
          eyebrow="Knockout bonuses"
          title="Extra time & penalties"
          subtitle="Optional add-ons stacked on top of your 90-minute prediction. Skipping costs you nothing."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KO_RULES.map((rule, i) => (
            <BonusCard key={rule.title} {...rule} index={i} />
          ))}
        </div>
      </section>

      {/* Notes */}
      <section>
        <SectionHeader
          eyebrow="The fine print"
          title="House rules"
          subtitle="Quick reminders on locks, sync, and tiebreaks."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {NOTES.map((note) => (
            <div
              key={note.title}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
                <note.Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm leading-tight">
                  {note.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{note.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-primary/80">
        {eyebrow}
      </p>
      <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mt-1">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function RuleCard({
  points,
  title,
  desc,
  example,
  tone,
  Icon,
  index,
}: {
  points: number;
  title: string;
  desc: string;
  example: string;
  tone: Tone;
  Icon: React.ComponentType<{ className?: string }>;
  index: number;
}) {
  const t = TONE_MAP[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-5",
        t.border,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-20 bg-gradient-to-b pointer-events-none",
          t.ring,
        )}
      />
      <div className="relative flex items-start gap-3">
        <div className={cn("p-2 rounded-lg shrink-0", t.iconBg)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="font-bold text-white text-base leading-tight">
              {title}
            </h3>
            <span
              className={cn(
                "text-xs font-extrabold font-mono px-2 py-1 rounded-full border whitespace-nowrap",
                t.badge,
              )}
            >
              {points} pts
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{desc}</p>
          <p className="text-xs text-muted-foreground/80 bg-background/60 border border-border rounded-md p-2 mt-3 italic">
            <strong className="text-white/90 not-italic font-semibold">Example:</strong>{" "}
            {example}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function BonusCard({
  points,
  title,
  desc,
  example,
  index,
}: {
  points: number;
  title: string;
  desc: string;
  example: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-card p-5"
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base leading-tight">
              {title}
            </h3>
          </div>
          <span className="text-xs font-extrabold font-mono px-2 py-1 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30 whitespace-nowrap">
            +{points} pts
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{desc}</p>
        <p className="text-xs text-muted-foreground/80 bg-background/60 border border-border rounded-md p-2 mt-3 italic">
          <strong className="text-white/90 not-italic font-semibold">Example:</strong>{" "}
          {example}
        </p>
      </div>
    </motion.div>
  );
}
