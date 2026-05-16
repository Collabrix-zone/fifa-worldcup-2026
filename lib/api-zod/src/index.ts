// Re-export Zod runtime schemas (used by server for validation).
export * from "./generated/api";

// We intentionally do NOT re-export TypeScript types from "./generated/types"
// at the top level: Orval auto-generates `<OperationId>Params` and `<...>Body`
// names in BOTH api.ts (Zod schemas) and types/ (TS types), which collide
// when re-exported together (TS2308). Server code can derive types via
// `z.infer<typeof X>`, or import a specific type directly from
// "@workspace/api-zod/generated/types/<name>".
