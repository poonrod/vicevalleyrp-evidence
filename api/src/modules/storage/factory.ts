import { env, assertStorageConfigured } from "../../config/env";
import { R2StorageProvider } from "./R2StorageProvider";
import { S3StorageProvider } from "./S3StorageProvider";
import type { StorageProvider } from "./StorageProvider";

export function createStorageProvider(): StorageProvider {
  assertStorageConfigured();

  if (env.STORAGE_PROVIDER === "r2") {
    const endpoint =
      env.R2_ENDPOINT ||
      (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
    return new R2StorageProvider({
      kind: "r2",
      bucket: env.R2_BUCKET,
      region: "auto",
      endpoint,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      forcePathStyle: true,
    });
  }

  return new S3StorageProvider({
    kind: env.S3_ENDPOINT ? "s3_compatible" : "s3",
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: !!env.S3_ENDPOINT,
  });
}
