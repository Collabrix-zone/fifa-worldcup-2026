import { randomUUID } from "node:crypto";
import { db, objectFilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

export interface UploadTarget {
  uploadURL: string;
  objectPath: string;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async createUploadTarget({
    baseUrl,
    metadata,
    userId,
  }: {
    baseUrl: string;
    metadata: UploadMetadata;
    userId: number;
  }): Promise<UploadTarget> {
    if (metadata.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File is too large. Maximum upload size is ${MAX_UPLOAD_BYTES} bytes.`);
    }

    const objectId = randomUUID();
    const objectPath = `/objects/${objectId}`;
    await db.insert(objectFilesTable).values({
      objectPath,
      originalName: metadata.name,
      contentType: metadata.contentType,
      size: metadata.size,
      createdBy: userId,
    });

    return {
      uploadURL: `${baseUrl}/api/storage/uploads/${objectId}`,
      objectPath,
    };
  }

  async saveUploadedObject({
    objectId,
    contentType,
    data,
  }: {
    objectId: string;
    contentType: string;
    data: Buffer;
  }): Promise<void> {
    if (data.byteLength <= 0) {
      throw new Error("Uploaded file is empty");
    }
    if (data.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(`File is too large. Maximum upload size is ${MAX_UPLOAD_BYTES} bytes.`);
    }

    const objectPath = `/objects/${objectId}`;
    const [existing] = await db
      .select({ id: objectFilesTable.id })
      .from(objectFilesTable)
      .where(eq(objectFilesTable.objectPath, objectPath));
    if (!existing) {
      throw new ObjectNotFoundError();
    }

    await db
      .update(objectFilesTable)
      .set({
        contentType,
        size: data.byteLength,
        dataBase64: data.toString("base64"),
        uploaded: true,
        uploadedAt: new Date(),
      })
      .where(eq(objectFilesTable.objectPath, objectPath));
  }

  async downloadObjectEntity(objectPath: string, cacheTtlSec: number = 3600): Promise<Response> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const [row] = await db
      .select()
      .from(objectFilesTable)
      .where(eq(objectFilesTable.objectPath, objectPath));
    if (!row?.uploaded || !row.dataBase64) {
      throw new ObjectNotFoundError();
    }

    const data = Buffer.from(row.dataBase64, "base64");
    return new Response(data, {
      headers: {
        "Content-Type": row.contentType || "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      },
    });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  toPublicUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/objects/")) return `/api/storage${path}`;
    return path;
  }
}
