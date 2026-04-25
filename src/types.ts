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
  createdAt: string;
  displayName: string;
}

export interface FocusRequest {
  id: string;
  nonce: number;
}
