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
