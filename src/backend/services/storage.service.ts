// ============================================================
// CapitalForge — File Storage Service
//
// Unified file storage abstraction with dual-mode operation:
//   - S3/R2 mode: when AWS_ACCESS_KEY_ID + S3_BUCKET_NAME are set,
//     uses @aws-sdk/client-s3 for cloud object storage
//   - Local mode: graceful fallback to `uploads/` directory when
//     S3 is not configured (dev/test environments)
//
// Exports:
//   StorageService  — singleton class
//   storageService  — pre-wired default instance
//   Interfaces:     UploadFileInput, UploadFileResult, StorageMode
// ============================================================

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import logger from '../config/logger.js';

// ── Types ──────────────────────────────────────────────────────

export type StorageMode = 's3' | 'local';

export interface UploadFileInput {
  /** Raw file content */
  content: Buffer;
  /** Target storage path (e.g. "tenantId/documents/file.pdf") */
  path: string;
  /** MIME type — defaults to application/octet-stream */
  contentType?: string;
  /** Optional metadata tags stored alongside the object */
  metadata?: Record<string, string>;
}

export interface UploadFileResult {
  /** The storage key / path where the file was saved */
  key: string;
  /** Storage mode used for this operation */
  mode: StorageMode;
  /** Size in bytes */
  sizeBytes: number;
  /** Public or local URL to access the file (not pre-signed) */
  location: string;
}

export interface SignedUrlResult {
  /** The download URL (pre-signed for S3, local file path for local mode) */
  url: string;
  /** Unix epoch (seconds) when the URL expires — 0 for local mode */
  expiresAt: number;
  /** Storage mode used */
  mode: StorageMode;
}

export interface DeleteFileResult {
  /** Whether the file was found and deleted */
  deleted: boolean;
  /** Storage mode used */
  mode: StorageMode;
}

// ── Configuration ──────────────────────────────────────────────

const AWS_REGION          = process.env.AWS_REGION ?? 'us-east-1';
const AWS_ACCESS_KEY_ID   = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET_NAME      = process.env.S3_BUCKET_NAME ?? 'capitalforge-documents';
const S3_ENDPOINT         = process.env.S3_ENDPOINT; // Cloudflare R2 or MinIO endpoint
const LOCAL_UPLOADS_DIR   = resolve(process.env.UPLOADS_DIR ?? 'uploads');
const DEFAULT_PRESIGN_TTL = 900; // 15 minutes

// ── S3 client (lazy-loaded) ────────────────────────────────────

let _s3Client: unknown = null;
let _s3Loaded = false;

/**
 * Attempt to load AWS SDK and create an S3 client.
 * Returns null if SDK is not installed or credentials are missing.
 */
async function getS3Client(): Promise<unknown> {
  if (_s3Loaded) return _s3Client;
  _s3Loaded = true;

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    logger.info('[StorageService] No AWS credentials configured — using local storage fallback');
    return null;
  }

  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
      ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: true } : {}),
    });
    logger.info('[StorageService] S3 client initialized', {
      region: AWS_REGION,
      bucket: S3_BUCKET_NAME,
      endpoint: S3_ENDPOINT ?? 'default',
    });
    return _s3Client;
  } catch {
    logger.warn('[StorageService] @aws-sdk/client-s3 not installed — using local storage fallback');
    return null;
  }
}

// ── StorageService ─────────────────────────────────────────────

export class StorageService {
  private readonly bucket: string;
  private readonly uploadsDir: string;

  constructor(opts?: { bucket?: string; uploadsDir?: string }) {
    this.bucket     = opts?.bucket     ?? S3_BUCKET_NAME;
    this.uploadsDir = opts?.uploadsDir ?? LOCAL_UPLOADS_DIR;
  }

  /**
   * Determine the active storage mode based on available configuration.
   */
  async getMode(): Promise<StorageMode> {
    const client = await getS3Client();
    return client ? 's3' : 'local';
  }

  // ── Upload ─────────────────────────────────────────────────

  /**
   * Upload a file to S3/R2 (if configured) or the local filesystem.
   *
   * @param file - Buffer content to store
   * @param path - Target key / path (e.g. "tenant/docs/report.pdf")
   * @returns Upload result with key, mode, size, and location
   */
  async uploadFile(file: Buffer, path: string): Promise<UploadFileResult>;
  async uploadFile(input: UploadFileInput): Promise<UploadFileResult>;
  async uploadFile(
    fileOrInput: Buffer | UploadFileInput,
    maybePath?: string,
  ): Promise<UploadFileResult> {
    const input: UploadFileInput = Buffer.isBuffer(fileOrInput)
      ? { content: fileOrInput, path: maybePath! }
      : fileOrInput;

    const client = await getS3Client();
    if (client) {
      return this._uploadS3(client, input);
    }
    return this._uploadLocal(input);
  }

  // ── Signed URL / Download ──────────────────────────────────

  /**
   * Generate a pre-signed download URL (S3) or return the local file path.
   *
   * @param path      - Storage key / path
   * @param expiresIn - TTL in seconds (default 900 = 15 min). Ignored for local mode.
   */
  async getSignedUrl(path: string, expiresIn?: number): Promise<SignedUrlResult> {
    const client = await getS3Client();
    if (client) {
      return this._getSignedUrlS3(client, path, expiresIn ?? DEFAULT_PRESIGN_TTL);
    }
    return this._getSignedUrlLocal(path);
  }

  // ── Delete ─────────────────────────────────────────────────

  /**
   * Delete a file from S3/R2 or the local filesystem.
   */
  async deleteFile(path: string): Promise<DeleteFileResult> {
    const client = await getS3Client();
    if (client) {
      return this._deleteS3(client, path);
    }
    return this._deleteLocal(path);
  }

  // ── S3 implementations ────────────────────────────────────

  private async _uploadS3(client: unknown, input: UploadFileInput): Promise<UploadFileResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         input.path,
      Body:        input.content,
      ContentType: input.contentType ?? 'application/octet-stream',
      Metadata:    input.metadata,
    });

    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(command);

    logger.debug('[StorageService] S3 upload complete', {
      bucket: this.bucket,
      key:    input.path,
      size:   input.content.length,
    });

    return {
      key:       input.path,
      mode:      's3',
      sizeBytes: input.content.length,
      location:  `https://${this.bucket}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(input.path)}`,
    };
  }

  private async _getSignedUrlS3(
    client: unknown,
    path: string,
    expiresIn: number,
  ): Promise<SignedUrlResult> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    path,
    });

    const url = await getSignedUrl(
      client as Parameters<typeof getSignedUrl>[0],
      command,
      { expiresIn },
    );

    return {
      url,
      expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
      mode:      's3',
    };
  }

  private async _deleteS3(client: unknown, path: string): Promise<DeleteFileResult> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key:    path,
    });

    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(command);

    logger.debug('[StorageService] S3 delete complete', { bucket: this.bucket, key: path });

    return { deleted: true, mode: 's3' };
  }

  // ── Local implementations ─────────────────────────────────

  private async _uploadLocal(input: UploadFileInput): Promise<UploadFileResult> {
    const fullPath = join(this.uploadsDir, input.path);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, input.content);

    logger.debug('[StorageService] Local upload complete', {
      path: fullPath,
      size: input.content.length,
    });

    return {
      key:       input.path,
      mode:      'local',
      sizeBytes: input.content.length,
      location:  fullPath,
    };
  }

  private async _getSignedUrlLocal(path: string): Promise<SignedUrlResult> {
    const fullPath = join(this.uploadsDir, path);

    return {
      url:       fullPath,
      expiresAt: 0, // local files don't expire
      mode:      'local',
    };
  }

  private async _deleteLocal(path: string): Promise<DeleteFileResult> {
    const fullPath = join(this.uploadsDir, path);

    try {
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
        logger.debug('[StorageService] Local delete complete', { path: fullPath });
        return { deleted: true, mode: 'local' };
      }
      return { deleted: false, mode: 'local' };
    } catch (err) {
      logger.warn('[StorageService] Local delete failed', {
        path: fullPath,
        error: err instanceof Error ? err.message : String(err),
      });
      return { deleted: false, mode: 'local' };
    }
  }
}

// ── Default singleton ──────────────────────────────────────────

export const storageService = new StorageService();
