export interface PointAnnotation {
  type: "point";
  x: number;
  y: number;
}

export interface RectAnnotation {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Annotation = PointAnnotation | RectAnnotation;

export interface TextRange {
  from: number;
  to: number;
  quote: string;
}

export type CommentUrgency =
  | "idea"
  | "suggestion"
  | "important"
  | "critical";

export const COMMENT_URGENCIES: CommentUrgency[] = [
  "idea",
  "suggestion",
  "important",
  "critical",
];

export const COMMENT_REACTION_EMOJIS = ["👍", "👀", "❤️", "😂", "🎉"] as const;
export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

export interface CommentReactionSummary {
  emoji: CommentReactionEmoji;
  count: number;
  reactedByMe: boolean;
}

export interface Comment {
  id: string;
  videoId: string;
  authorType: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  timestamp: number | null;
  text: string;
  parentId: string | null;
  isResolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolvedReason: "manual" | "text_edited" | null;
  annotation: Annotation | null;
  urgency: CommentUrgency;
  phase: "script" | "review";
  textRange: TextRange | null;
  createdAt: string;
  name: string;
  reactions: CommentReactionSummary[];
}

export interface FocusRequest {
  id: string;
  nonce: number;
}

export const PROJECT_STATUSES = [
  "creating_script",
  "reviewing_script",
  "reviewing_video",
  "video_approved",
  "published",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// Backward-compatible aliases while the persisted column is still named `phase`.
export const VIDEO_PHASES = PROJECT_STATUSES;
export type VideoPhase = ProjectStatus;

export const SCRIPT_STATUSES = ["writing", "review"] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  creating_script: "Creating Script",
  reviewing_script: "Reviewing Script",
  reviewing_video: "Reviewing Video",
  video_approved: "Video Approved",
  published: "Published",
};

export const PHASE_LABELS = PROJECT_STATUS_LABELS;

export function normalizeVideoPhase(phase: string | null | undefined): VideoPhase {
  if (phase === "script") return "creating_script";
  if (phase === "review") return "reviewing_video";
  if (PROJECT_STATUSES.includes(phase as ProjectStatus)) return phase as ProjectStatus;
  return "reviewing_video";
}
