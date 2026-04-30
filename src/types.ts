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
  annotation: Annotation | null;
  urgency: CommentUrgency;
  createdAt: string;
  displayName: string;
  reactions: CommentReactionSummary[];
}

export interface FocusRequest {
  id: string;
  nonce: number;
}
