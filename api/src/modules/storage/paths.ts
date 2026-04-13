import { randomUUID } from "crypto";

export function evidenceObjectKey(params: {
  discordId: string;
  evidenceId: string;
  extension: string;
  year?: number;
  month?: number;
  incidentId?: string;
  caseNumber?: string | null;
}): string {
  const now = new Date();
  const y = params.year ?? now.getUTCFullYear();
  const m = params.month ?? now.getUTCMonth() + 1;
  const ext = params.extension.startsWith(".") ? params.extension : `.${params.extension}`;
  if (params.caseNumber) {
    const safeCase = sanitizeSegment(params.caseNumber);
    return `evidence/${y}/${m}/${params.discordId}/${safeCase}/${params.evidenceId}${ext}`;
  }
  const inc = params.incidentId ? sanitizeSegment(params.incidentId) : "no-incident";
  return `evidence/${y}/${m}/${params.discordId}/${inc}/${params.evidenceId}${ext}`;
}

export function tempObjectKey(discordId: string, sessionId: string, fileName: string): string {
  return `temp/${discordId}/${sessionId}/${sanitizeSegment(fileName)}`;
}

export function archivedObjectKey(params: {
  year: number;
  month: number;
  caseNumber: string;
  evidenceId: string;
  extension: string;
}): string {
  const ext = params.extension.startsWith(".") ? params.extension : `.${params.extension}`;
  return `archived/${params.year}/${params.month}/${sanitizeSegment(params.caseNumber)}/${params.evidenceId}${ext}`;
}

export function newEvidenceId(): string {
  return randomUUID();
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

export function extensionFromFileName(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i) : "";
}
