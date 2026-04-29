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
  displayName: string;
}

export interface FocusRequest {
  id: string;
  nonce: number;
}

export const VIDEO_PHASES = ["script", "review", "published"] as const;
export type VideoPhase = (typeof VIDEO_PHASES)[number];

export const SCRIPT_STATUSES = ["writing", "review"] as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number];

export const PHASE_LABELS: Record<VideoPhase, string> = {
  script: "Script",
  review: "Video",
  published: "Published",
};

export function normalizeVideoPhase(phase: string | null | undefined): VideoPhase {
  if (phase === "script" || phase === "published") return phase;
  return "review";
}
