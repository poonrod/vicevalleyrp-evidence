export interface PresignedResult {
  url: string;
  storageKey: string;
  bucket: string;
  expiresInSeconds: number;
}

export interface StorageProvider {
  readonly kind: "r2" | "s3" | "s3_compatible";
  getBucket(): string;
  createPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength?: number;
    expiresSeconds: number;
  }): Promise<PresignedResult>;
  createPresignedDownloadUrl(params: {
    key: string;
    expiresSeconds: number;
  }): Promise<{ url: string; expiresInSeconds: number }>;
  finalizeUpload?(key: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  /** List object keys under a prefix (for developer maintenance; capped by caller). */
  listObjectKeys?(params: { prefix: string; maxKeys: number; continuationToken?: string }): Promise<{
    keys: string[];
    nextContinuationToken?: string;
  }>;
  /** Stream object body and return SHA-256 hex (developer maintenance). */
  computeObjectSha256?(key: string): Promise<string | null>;
}
