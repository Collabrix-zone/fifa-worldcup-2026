// Vercel serverless entry. Delegates every /api/* request to the
// pre-built Express handler bundle. Wraps in try/catch so a load-time
// crash surfaces as a real 500 body instead of FUNCTION_INVOCATION_FAILED.

export const config = { runtime: "nodejs" };

let appPromise: Promise<unknown> | null = null;

async function loadApp(): Promise<unknown> {
  // @ts-expect-error — bundle materialised at build time
  const mod = await import("../apps/api-server/dist/handler.mjs");
  return mod.default;
}

export default async function vercelHandler(req: unknown, res: unknown): Promise<unknown> {
  try {
    if (!appPromise) appPromise = loadApp();
    const app = (await appPromise) as (req: unknown, res: unknown) => unknown;
    return app(req, res);
  } catch (err) {
    const r = res as {
      statusCode?: number;
      setHeader?: (k: string, v: string) => void;
      end?: (chunk?: string) => void;
    };
    if (r && typeof r.end === "function") {
      r.statusCode = 500;
      try {
        r.setHeader?.("Content-Type", "application/json");
      } catch {
        // ignore — headers already sent
      }
      r.end(
        JSON.stringify({
          error: "function_init_failed",
          message: (err as Error)?.message ?? String(err),
        }),
      );
    }
    return undefined;
  }
}
