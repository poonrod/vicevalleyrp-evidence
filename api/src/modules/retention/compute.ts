import type { EvidenceItem, EvidenceNote, EvidenceTag } from "@prisma/client";
import type { RetentionSettings } from "./settings";

export function isUnmodifiedEvidence(
  e: EvidenceItem & { tags: EvidenceTag[]; notes: EvidenceNote[] },
  s: RetentionSettings
): boolean {
  if (e.legalHold) return false;
  if (e.manualRetainUntil && e.manualRetainUntil > new Date()) return false;
  if (e.caseNumber && s.caseNumberCountsAsProtected) return false;
  if (e.isArchived || e.archiveStatus === "archived") return false;
  const hasTags = e.tags.length > 0;
  const hasNotes = e.notes.length > 0;
  if (hasTags && s.tagsCountAsModified) return false;
  if (hasNotes && s.notesCountAsModified) return false;
  if (e.caseNumber) return false;
  return true;
}

export function computeRetentionClass(
  e: Pick<
    EvidenceItem,
    | "caseNumber"
    | "legalHold"
    | "isArchived"
    | "archiveStatus"
    | "videoTier"
    | "retentionClass"
  > & { tagCount: number; noteCount: number },
  s: RetentionSettings
): string {
  if (e.legalHold) return "held";
  if (e.isArchived || e.archiveStatus === "archived") return "archived";
  if (e.caseNumber && s.caseNumberCountsAsProtected) return "case_linked";
  if ((e.tagCount > 0 && s.tagsCountAsModified) || (e.noteCount > 0 && s.notesCountAsModified))
    return "tagged_modified";
  if (e.videoTier === "long") return "long_video";
  return "default";
}

export function computeScheduledDeletionAt(
  createdAt: Date,
  retentionClass: string,
  s: RetentionSettings
): Date | null {
  if (!s.autoDeleteEnabled) return null;
  if (retentionClass === "held") return null;

  let days = s.defaultDeleteAfterDays;
  if (retentionClass === "case_linked") days = s.caseEvidenceDeleteAfterDays;
  else if (retentionClass === "tagged_modified") days = s.taggedEvidenceDeleteAfterDays;
  else if (retentionClass === "archived") days = s.archivedDeleteAfterDays;
  else if (retentionClass === "long_video") days = s.longVideoDeleteAfterDays;
  else if (retentionClass === "temp") days = s.tempDeleteAfterDays;

  const d = new Date(createdAt);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function unlinkedDefaultVideoRetentionHours(s: RetentionSettings): number {
  const h = s.videoWithoutCaseDeleteAfterHours;
  if (typeof h === "number" && !Number.isNaN(h) && h > 0) {
    return Math.min(h, 24 * 365 * 10);
  }
  return Math.max(1, s.videoWithoutCaseDeleteAfterDays) * 24;
}

/**
 * `anchorUtc` should be when the file was accepted into storage (e.g. `uploadedAt` / API complete time),
 * not the in-game capture clock, so “delete 48h after upload” matches operator expectations.
 */
export function computeEvidenceScheduledDeletion(
  anchorUtc: Date,
  retentionClass: string,
  s: RetentionSettings,
  opts: { evidenceType: string; caseNumber?: string | null }
): Date | null {
  const scheduled = computeScheduledDeletionAt(anchorUtc, retentionClass, s);
  if (scheduled === null) return null;
  const hasCase = !!(opts.caseNumber && String(opts.caseNumber).trim());
  if (opts.evidenceType === "video" && !hasCase && retentionClass === "default") {
    const hours = unlinkedDefaultVideoRetentionHours(s);
    return new Date(anchorUtc.getTime() + hours * 3600 * 1000);
  }
  return scheduled;
}
