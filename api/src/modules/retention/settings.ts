export type RetentionSettings = {
  defaultDeleteAfterDays: number;
  caseEvidenceDeleteAfterDays: number;
  taggedEvidenceDeleteAfterDays: number;
  tempDeleteAfterDays: number;
  archivedDeleteAfterDays: number;
  longVideoDeleteAfterDays: number;
  /** Bodycam-style clips (and other `default`-class video) with no case number. */
  videoWithoutCaseDeleteAfterDays: number;
  notesCountAsModified: boolean;
  tagsCountAsModified: boolean;
  caseNumberCountsAsProtected: boolean;
  autoDeleteEnabled: boolean;
  deleteWorkerEnabled: boolean;
  requireAdminApprovalForHardDelete: boolean;
  useSoftDeleteBeforeHardDelete: boolean;
  softDeleteGraceDays: number;
  shortClipMaxSeconds: number;
  mediumClipMaxSeconds: number;
  longVideoMaxSeconds: number;
  maxUploadSizeMB: number;
  shortClipResolution: string;
  shortClipBitrateKbps: number;
  /** Target encode / capture frame rate for short-tier (e.g. bodycam WebM) clips. */
  shortClipFps: number;
  mediumClipResolution: string;
  mediumClipBitrateKbps: number;
  mediumClipFps: number;
  longVideoResolution: string;
  longVideoBitrateKbps: number;
  longVideoFps: number;
  videoCodec: string;
  enableLongVideoMode: boolean;
  requireCaseNumberForLongVideos: boolean;
  longVideoWithoutCaseAction: "reject" | "trim" | "short_retention";
  enableLongVideoChunking: boolean;
  longVideoChunkSeconds: number;
};

export const DEFAULT_RETENTION_SETTINGS: RetentionSettings = {
  defaultDeleteAfterDays: 30,
  caseEvidenceDeleteAfterDays: 365,
  taggedEvidenceDeleteAfterDays: 180,
  tempDeleteAfterDays: 1,
  archivedDeleteAfterDays: 2555,
  longVideoDeleteAfterDays: 3,
  videoWithoutCaseDeleteAfterDays: 3,
  notesCountAsModified: true,
  tagsCountAsModified: true,
  caseNumberCountsAsProtected: true,
  autoDeleteEnabled: true,
  deleteWorkerEnabled: true,
  requireAdminApprovalForHardDelete: false,
  useSoftDeleteBeforeHardDelete: true,
  softDeleteGraceDays: 7,
  shortClipMaxSeconds: 30,
  mediumClipMaxSeconds: 300,
  longVideoMaxSeconds: 1800,
  maxUploadSizeMB: 100,
  shortClipResolution: "1280x720",
  shortClipBitrateKbps: 4500,
  shortClipFps: 30,
  mediumClipResolution: "1280x720",
  mediumClipBitrateKbps: 1500,
  mediumClipFps: 30,
  longVideoResolution: "960x540",
  longVideoBitrateKbps: 1000,
  longVideoFps: 30,
  videoCodec: "h264",
  enableLongVideoMode: false,
  requireCaseNumberForLongVideos: true,
  longVideoWithoutCaseAction: "reject",
  enableLongVideoChunking: true,
  longVideoChunkSeconds: 300,
};

export const RETENTION_KEYS = [
  "defaultDeleteAfterDays",
  "caseEvidenceDeleteAfterDays",
  "taggedEvidenceDeleteAfterDays",
  "tempDeleteAfterDays",
  "archivedDeleteAfterDays",
  "longVideoDeleteAfterDays",
  "videoWithoutCaseDeleteAfterDays",
  "notesCountAsModified",
  "tagsCountAsModified",
  "caseNumberCountsAsProtected",
  "autoDeleteEnabled",
  "deleteWorkerEnabled",
  "requireAdminApprovalForHardDelete",
  "useSoftDeleteBeforeHardDelete",
  "softDeleteGraceDays",
  "shortClipMaxSeconds",
  "mediumClipMaxSeconds",
  "longVideoMaxSeconds",
  "maxUploadSizeMB",
  "shortClipResolution",
  "shortClipBitrateKbps",
  "shortClipFps",
  "mediumClipResolution",
  "mediumClipBitrateKbps",
  "mediumClipFps",
  "longVideoResolution",
  "longVideoBitrateKbps",
  "longVideoFps",
  "videoCodec",
  "enableLongVideoMode",
  "requireCaseNumberForLongVideos",
  "longVideoWithoutCaseAction",
  "enableLongVideoChunking",
  "longVideoChunkSeconds",
] as const;
