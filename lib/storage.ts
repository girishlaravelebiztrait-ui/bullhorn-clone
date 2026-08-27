import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Storage abstraction for uploaded resume files.
 *
 * Phase 1 ships only the local-disk driver. The interface is intentionally
 * narrow (save / read / delete / resolve) so swapping to S3 later is a new
 * driver + a config change (STORAGE_DRIVER) rather than a rewrite of callers.
 */
export interface StoredFile {
  /** Opaque key/path used to reference the file later (stored as resumeUrl). */
  url: string;
}

export interface StorageDriver {
  save(fileName: string, data: Buffer): Promise<StoredFile>;
  read(url: string): Promise<Buffer>;
  delete(url: string): Promise<void>;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadRoot = path.isAbsolute(UPLOAD_DIR)
  ? UPLOAD_DIR
  : path.join(process.cwd(), UPLOAD_DIR);

function safeName(fileName: string): string {
  const ext = path.extname(fileName);
  const base = path
    .basename(fileName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 60);
  const rand = crypto.randomBytes(6).toString("hex");
  return `${Date.now()}-${rand}-${base}${ext}`;
}

class LocalStorageDriver implements StorageDriver {
  async save(fileName: string, data: Buffer): Promise<StoredFile> {
    await fs.mkdir(uploadRoot, { recursive: true });
    const name = safeName(fileName);
    const abs = path.join(uploadRoot, name);
    await fs.writeFile(abs, data);
    // resumeUrl is stored as a driver-relative key, e.g. "local:1699-ab-resume.pdf"
    return { url: `local:${name}` };
  }

  private resolve(url: string): string {
    const key = url.startsWith("local:") ? url.slice("local:".length) : url;
    // Prevent path traversal.
    const abs = path.join(uploadRoot, path.basename(key));
    return abs;
  }

  async read(url: string): Promise<Buffer> {
    return fs.readFile(this.resolve(url));
  }

  async delete(url: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(url));
    } catch {
      // File already gone — ignore.
    }
  }
}

// Placeholder for a future S3 driver. Left unimplemented on purpose.
// class S3StorageDriver implements StorageDriver { ... }

function createDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
  switch (driver) {
    case "local":
      return new LocalStorageDriver();
    // case "s3": return new S3StorageDriver();
    default:
      return new LocalStorageDriver();
  }
}

export const storage: StorageDriver = createDriver();
