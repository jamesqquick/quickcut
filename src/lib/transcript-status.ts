export type TranscriptStatus =
  | "not_requested"
  | "requested"
  | "queued"
  | "exporting_audio"
  | "waiting_for_audio"
  | "transcribing"
  | "cleaning"
  | "ready"
  | "ready_raw_only"
  | "failed"
  | "skipped_feature_disabled";
