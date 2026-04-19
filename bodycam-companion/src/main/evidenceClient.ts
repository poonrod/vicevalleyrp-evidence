import fs from "fs";
import { createHash } from "crypto";
import { logLine } from "./logger";

export interface UploadUrlResponse {
  url: string;
  storageKey: string;
  evidenceId: string;
  bucket?: string;
}

export interface CompleteEvidenceInput {
  storageKey: string;
  evidenceId?: string;
  officerDiscordId: string;
  officerName?: string;
  officerBadgeNumber?: string;
  officerDepartment?: string;
  officerCallsign?: string;
  caseNumber?: string | null;
  incidentId?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  type: "video";
  captureType: string;
  timestampUtc: string;
  durationSeconds?: number;
  sha256?: string;
  videoTier?: "short" | "medium" | "long";
  activationSource?: "manual_keybind" | "manual_command" | "auto_taser" | "auto_firearm";
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function readBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export async function requestUploadUrl(
  apiBase: string,
  apiSecret: string,
  body: Record<string, unknown>
): Promise<UploadUrlResponse> {
  const url = joinUrl(apiBase, "internal/fivem/evidence/upload-url");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fivem-secret": apiSecret,
    },
    body: JSON.stringify(body),
  });
  const text = await readBodySafe(res);
  if (!res.ok) {
    logLine("error", "upload-url failed", { status: res.status, text: text.slice(0, 500) });
    throw new Error(`upload-url ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as Record<string, unknown>;
  const putUrl = (data.url as string) || (data.upload as string);
  const storageKey = data.storageKey as string;
  const evidenceId = data.evidenceId as string;
  if (!putUrl || !storageKey) {
    throw new Error("upload-url response missing url or storageKey");
  }
  return { url: putUrl, storageKey, evidenceId, bucket: data.bucket as string | undefined };
}

export async function putFileToPresignedUrl(
  putUrl: string,
  filePath: string,
  mimeType: string
): Promise<void> {
  const buf = fs.readFileSync(filePath);
  const res = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: buf,
  });
  if (!res.ok) {
    const t = await readBodySafe(res);
    logLine("error", "presigned PUT failed", { status: res.status, body: t.slice(0, 400) });
    throw new Error(`PUT ${res.status}: ${t.slice(0, 200)}`);
  }
}

export async function completeEvidence(
  apiBase: string,
  apiSecret: string,
  body: CompleteEvidenceInput
): Promise<void> {
  const url = joinUrl(apiBase, "internal/fivem/evidence/complete");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fivem-secret": apiSecret,
    },
    body: JSON.stringify(body),
  });
  const text = await readBodySafe(res);
  if (!res.ok) {
    logLine("error", "complete failed", { status: res.status, text: text.slice(0, 500) });
    throw new Error(`complete ${res.status}: ${text.slice(0, 200)}`);
  }
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const rs = fs.createReadStream(filePath);
    rs.on("error", reject);
    rs.on("data", (c) => hash.update(c));
    rs.on("end", () => resolve(hash.digest("hex")));
  });
}
