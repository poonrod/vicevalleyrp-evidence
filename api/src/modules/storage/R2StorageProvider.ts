import { S3CompatibleStorage } from "./S3CompatibleStorage";

/** Default provider: Cloudflare R2 via S3-compatible API. */
export class R2StorageProvider extends S3CompatibleStorage {
  constructor(opts: ConstructorParameters<typeof S3CompatibleStorage>[0]) {
    super({ ...opts, kind: "r2" });
  }
}
