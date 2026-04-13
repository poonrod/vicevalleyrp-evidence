export type RetentionClass =
  | "temp"
  | "default"
  | "case_linked"
  | "tagged_modified"
  | "archived"
  | "held"
  | "long_video"
  | "deleted_tombstone";

export type VideoTier = "short" | "medium" | "long";

export type CaptureType =
  | "manual_snapshot"
  | "periodic_snapshot"
  | "auto_taser"
  | "auto_firearm"
  | "auto_taser_pre_event"
  | "auto_firearm_pre_event"
  | "clip_short"
  | "clip_medium"
  | "clip_long";

export type ActivationSource =
  | "manual_keybind"
  | "manual_command"
  | "auto_taser"
  | "auto_firearm";

export type LongVideoWithoutCaseAction = "reject" | "trim" | "short_retention";

export type StorageProviderType = "r2" | "s3" | "s3_compatible";
