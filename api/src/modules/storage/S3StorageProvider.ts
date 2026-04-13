import { S3CompatibleStorage } from "./S3CompatibleStorage";

/** AWS S3 or custom S3-compatible endpoint. */
export class S3StorageProvider extends S3CompatibleStorage {
  constructor(opts: ConstructorParameters<typeof S3CompatibleStorage>[0]) {
    super(opts);
  }
}
