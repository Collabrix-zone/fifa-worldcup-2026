import { parse } from "csv-parse/sync";
import { db, teamsTable, matchesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { enforceLockInvariant } from "./lockTime";

const REQUIRED_COLS = [
  "round",
  "group",
  "teamAName",
  "teamACode",
  "teamAFlag",
  "teamBName",
  "teamBCode",
  "teamBFlag",
  "kickoffTime",
  "lockTime",
];

export interface ImportSummary {
  matchesCreated: number;
  teamsCreated: number;
  skippedDuplicates: number;
  errors: string[];
}

async function ensureTeam(name: string, code: string, flag: string): Promise<{ id: number; created: boolean }> {
  const trimmedName = name.trim();
  const [existing] = await db.select().from(teamsTable).where(eq(teamsTable.name, trimmedName));
  if (existing) return { id: existing.id, created: false };
  const [row] = await db
    .insert(teamsTable)
    .values({ name: trimmedName, code: code.trim().toUpperCase(), flag: flag.trim() })
    .returning();
  return { id: row.id, created: true };
}

export async function importMatchesFromCsv(
  csvText: string,
  tournamentId: number,
  log?: Logger,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    matchesCreated: 0,
    teamsCreated: 0,
    skippedDuplicates: 0,
    errors: [],
  };

  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    summary.errors.push(`CSV parse error: ${(err as Error).message}`);
    return summary;
  }

  if (rows.length === 0) {
    summary.errors.push("CSV contained no data rows.");
    return summary;
  }

  const headerCols = Object.keys(rows[0]);
  const missing = REQUIRED_COLS.filter((c) => !headerCols.includes(c));
  if (missing.length > 0) {
    summary.errors.push(`Missing required columns: ${missing.join(", ")}`);
    return summary;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 2;
    try {
      const kickoff = new Date(row.kickoffTime);
      const lock = new Date(row.lockTime);
      if (Number.isNaN(kickoff.getTime())) {
        summary.errors.push(`Row ${lineNo}: invalid kickoffTime "${row.kickoffTime}"`);
        continue;
      }
      // lockTime is optional in practice — we always clamp to kickoff − 15min
      // so a missing/invalid value just falls back to the cap.
      const safeLock = enforceLockInvariant(kickoff, Number.isNaN(lock.getTime()) ? null : lock);
      if (!row.teamAName || !row.teamBName) {
        summary.errors.push(`Row ${lineNo}: team names required`);
        continue;
      }

      const teamA = await ensureTeam(row.teamAName, row.teamACode, row.teamAFlag);
      const teamB = await ensureTeam(row.teamBName, row.teamBCode, row.teamBFlag);
      if (teamA.created) summary.teamsCreated++;
      if (teamB.created) summary.teamsCreated++;

      const [dup] = await db
        .select({ id: matchesTable.id })
        .from(matchesTable)
        .where(
          and(
            eq(matchesTable.tournamentId, tournamentId),
            eq(matchesTable.teamAId, teamA.id),
            eq(matchesTable.teamBId, teamB.id),
            eq(matchesTable.kickoffTime, kickoff),
          ),
        );
      if (dup) {
        summary.skippedDuplicates++;
        continue;
      }

      await db.insert(matchesTable).values({
        tournamentId,
        round: row.round || "Group Stage",
        group: row.group || "",
        teamAId: teamA.id,
        teamBId: teamB.id,
        kickoffTime: kickoff,
        lockTime: safeLock,
        status: "open",
      });
      summary.matchesCreated++;
    } catch (err) {
      const msg = `Row ${lineNo}: ${(err as Error).message}`;
      summary.errors.push(msg);
      log?.warn({ err }, msg);
    }
  }

  return summary;
}
