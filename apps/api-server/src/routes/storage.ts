import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function requestBaseUrl(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  return `${proto}://${host}`;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * requireAuth: only signed-in users may mint upload URLs (prevents anonymous
 * abuse / cost amplification against our object storage bucket).
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const { uploadURL, objectPath } = await objectStorageService.createUploadTarget({
      baseUrl: requestBaseUrl(req),
      metadata: { name, size, contentType },
      userId: req.user!.id,
    });

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.put(
  "/storage/uploads/:objectId",
  express.raw({ type: "*/*", limit: "10mb" }),
  async (req: Request, res: Response) => {
    try {
      const objectId = String(req.params.objectId ?? "");
      const contentType = req.get("content-type") || "application/octet-stream";
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      await objectStorageService.saveUploadedObject({ objectId, contentType, data });
      res.status(204).end();
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Upload target not found" });
        return;
      }
      req.log.error({ err: error }, "Error accepting upload");
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Backwards-compatible public object route. App-owned uploads are served from
 * /storage/objects/* below.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  req.log.warn({ path: req.params.filePath }, "public object route is not configured");
  res.status(404).json({ error: "File not found" });
});

/**
 * GET /storage/objects/*
 *
 * Serve uploaded object entities.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const response = await objectStorageService.downloadObjectEntity(objectPath);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
