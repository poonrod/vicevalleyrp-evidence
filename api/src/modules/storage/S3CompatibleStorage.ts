import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import type { StorageProvider, PresignedResult } from "./StorageProvider";

export class S3CompatibleStorage implements StorageProvider {
  readonly kind: "r2" | "s3" | "s3_compatible";
  private client: S3Client;
  private bucket: string;

  constructor(opts: {
    kind: "r2" | "s3" | "s3_compatible";
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  }) {
    this.kind = opts.kind;
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
      forcePathStyle: opts.forcePathStyle ?? !!opts.endpoint,
      // Newer @aws-sdk/client-s3 defaults add CRC query params to presigned URLs; simple HTTP clients
      // (e.g. game NUI fetch PUT) do not reproduce the same canonical request. Prefer legacy signing.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  getBucket(): string {
    return this.bucket;
  }

  async createPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength?: number;
    expiresSeconds: number;
  }): Promise<PresignedResult> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ...(params.contentLength != null ? { ContentLength: params.contentLength } : {}),
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: params.expiresSeconds });
    return {
      url,
      storageKey: params.key,
      bucket: this.bucket,
      expiresInSeconds: params.expiresSeconds,
    };
  }

  async createPresignedDownloadUrl(params: {
    key: string;
    expiresSeconds: number;
  }): Promise<{ url: string; expiresInSeconds: number }> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: params.expiresSeconds });
    return { url, expiresInSeconds: params.expiresSeconds };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async listObjectKeys(params: {
    prefix: string;
    maxKeys: number;
    continuationToken?: string;
  }): Promise<{ keys: string[]; nextContinuationToken?: string }> {
    const out = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: params.prefix,
        MaxKeys: Math.min(1000, Math.max(1, params.maxKeys)),
        ContinuationToken: params.continuationToken,
      })
    );
    const keys = (out.Contents ?? []).map((c) => c.Key).filter((k): k is string => !!k);
    return {
      keys,
      nextContinuationToken: out.IsTruncated ? out.NextContinuationToken : undefined,
    };
  }

  async computeObjectSha256(key: string): Promise<string | null> {
    const head = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const size = head.ContentLength ?? 0;
    const maxBytes = 400 * 1024 * 1024;
    if (size > maxBytes) return null;

    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const body = out.Body;
    if (!body) return null;
    const bytes = await body.transformToByteArray();
    return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  }
}
