import { useState, useEffect, useRef, useCallback } from "react";
import { formatTimecode, relativeTime } from "../lib/time";
import { connectVideoRoom } from "../lib/realtime";
import type { Viewer } from "../lib/realtime";
import { PresenceBar } from "./PresenceBar";

interface Comment {
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

interface FocusRequest {
  id: string;
  nonce: number;
}

interface CommentThreadProps {
  videoId: string;
  initialComments: Comment[];
  currentUserId?: string;
  currentUserName?: string;
  isAuthenticated: boolean;
  duration: number | null;
  videoStatus: string;
  currentTime?: number;
  shareToken?: string;
  anonymousName?: string;
  /** When true, open a WebSocket to the per-video room for live updates. */
  liveEnabled?: boolean;
  onSeek?: (time: number) => void;
  onNameRequired?: () => void;
  onCommentsChange?: (comments: Comment[]) => void;
  focusRequest?: FocusRequest | null;
}

type FilterType = "all" | "unresolved" | "resolved";

const sortComments = (list: Comment[]): Comment[] =>
  [...list].sort((a, b) => {
    const ta = a.timestamp ?? -1;
    const tb = b.timestamp ?? -1;
    if (ta !== tb) return ta - tb;
    return a.createdAt.localeCompare(b.createdAt);
  });

export function CommentThread({
  videoId,
  initialComments,
  currentUserId,
  currentUserName,
  isAuthenticated,
  duration,
  videoStatus,
  currentTime = 0,
  shareToken,
  anonymousName,
  liveEnabled = false,
  onSeek,
  onNameRequired,
  onCommentsChange,
  focusRequest,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [filter, setFilter] = useState<FilterType>("all");
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(!!liveEnabled);
  const lastFetchRef = useRef<string>(new Date().toISOString());
  const threadRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Notify parent when comments change
  useEffect(() => {
    onCommentsChange?.(comments);
  }, [comments, onCommentsChange]);

  // Polling for new comments. Acts as a fallback when the WebSocket
  // connection is briefly unavailable; the WS path is primary when liveEnabled.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const baseUrl = shareToken
          ? `/api/share/${shareToken}/comments`
          : `/api/videos/${videoId}/comments`;
        const res = await fetch(`${baseUrl}?since=${encodeURIComponent(lastFetchRef.current)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.comments && data.comments.length > 0) {
            setComments((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const newOnes = data.comments.filter(
                (c: Comment) => !existingIds.has(c.id),
              );
              // Also update resolved status for existing comments
              const updated = prev.map((existing) => {
                const updatedComment = data.comments.find(
                  (c: Comment) => c.id === existing.id,
                );
                return updatedComment || existing;
              });
              return sortComments([...updated, ...newOnes]);
            });
            lastFetchRef.current = new Date().toISOString();
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [videoId, shareToken]);

  // Live updates via the per-video VideoRoom Durable Object. Dedupe on id so
  // the poster's own client doesn't double-render when the broadcast echoes.
  useEffect(() => {
    if (!liveEnabled) return;

    const conn = connectVideoRoom(
      videoId,
      {
        shareToken,
        viewerName: anonymousName || currentUserName,
        viewerUserId: currentUserId,
      },
      {
        onComment: (incoming) => {
          setComments((prev) => {
            if (prev.some((c) => c.id === incoming.id)) return prev;
            return sortComments([...prev, incoming as unknown as Comment]);
          });
          lastFetchRef.current = new Date().toISOString();
        },
        onPresence: (incomingViewers) => {
          setViewers(incomingViewers);
          setPresenceLoading(false);
        },
      },
    );

    return () => {
      conn.disconnect();
      setViewers([]);
      setPresenceLoading(false);
    };
  }, [liveEnabled, videoId, shareToken, anonymousName, currentUserName, currentUserId]);

  // Scroll to and highlight a comment when focusRequest changes
  useEffect(() => {
    if (!focusRequest?.id) return;
    const target = comments.find((c) => c.id === focusRequest.id);
    if (!target) return;

    // If filtered out, switch to "all" so the comment is visible
    if (filter === "unresolved" && target.isResolved) setFilter("all");
    if (filter === "resolved" && !target.isResolved) setFilter("all");

    // Wait a tick so the DOM reflects any filter change
    const scrollTimer = window.setTimeout(() => {
      const node = commentRefs.current.get(focusRequest.id);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setHighlightedId(focusRequest.id);
    }, 50);

    const clearTimer = window.setTimeout(() => {
      setHighlightedId(null);
    }, 1800);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const rootComments = comments.filter((c) => !c.parentId);
  const getReplies = (parentId: string) =>
    comments.filter((c) => c.parentId === parentId);

  const filteredComments = rootComments.filter((c) => {
    if (filter === "unresolved") return !c.isResolved;
    if (filter === "resolved") return c.isResolved;
    return true;
  });

  const unresolvedCount = rootComments.filter((c) => !c.isResolved).length;
  const resolvedCount = rootComments.filter((c) => c.isResolved).length;

  const submitComment = async () => {
    if (!newComment.trim()) return;

    if (shareToken && !anonymousName) {
      onNameRequired?.();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const baseUrl = shareToken
        ? `/api/share/${shareToken}/comments`
        : `/api/videos/${videoId}/comments`;

      const body: Record<string, unknown> = {
        text: newComment.trim(),
        timestamp: videoStatus === "ready" ? currentTime : null,
      };

      if (shareToken && anonymousName) {
        body.displayName = anonymousName;
      }

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setComments((prev) => sortComments([...prev, data.comment]));
        setNewComment("");
        lastFetchRef.current = new Date().toISOString();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to post comment. Please try again.");
      }
    } catch {
      setError("Failed to post comment. Please try again.");
    }
    setSubmitting(false);
  };

  const submitReply = async (parentId: string) => {
    if (!replyText.trim()) return;

    if (shareToken && !anonymousName) {
      onNameRequired?.();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const baseUrl = shareToken
        ? `/api/share/${shareToken}/comments`
        : `/api/comments/${parentId}/reply`;

      const body: Record<string, unknown> = { text: replyText.trim() };

      if (shareToken) {
        body.parentId = parentId;
        if (anonymousName) body.displayName = anonymousName;
      }

      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setComments((prev) => sortComments([...prev, data.comment]));
        setReplyText("");
        setReplyingTo(null);
        lastFetchRef.current = new Date().toISOString();
      } else {
        setError("Failed to post reply.");
      }
    } catch {
      setError("Failed to post reply.");
    }
    setSubmitting(false);
  };

  const resolveComment = async (commentId: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/comments/${commentId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });

      if (res.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? {
                  ...c,
                  isResolved: resolved,
                  resolvedBy: resolved ? currentUserId || null : null,
                  resolvedAt: resolved ? new Date().toISOString() : null,
                }
              : c,
          ),
        );
      }
    } catch {
      // Handle error silently
    }
  };

  const deleteComment = async (commentId: string) => {
    setDeleting(commentId);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setComments((prev) =>
          prev.filter((c) => c.id !== commentId && c.parentId !== commentId),
        );
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete comment.");
      }
    } catch {
      setError("Failed to delete comment.");
    }
    setDeleting(null);
  };

  const canDelete = (comment: Comment) => {
    if (!isAuthenticated || !currentUserId) return false;
    return comment.authorType === "user" && comment.authorUserId === currentUserId;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTC = (seconds: number | null) => {
    return formatTimecode(seconds);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Presence bar */}
      {liveEnabled && <PresenceBar viewers={viewers} loading={presenceLoading} />}

      {/* Filter tabs */}
      <div className="flex border-b border-border-default">
        {(
          [
            { key: "all", label: "All", count: rootComments.length },
            { key: "unresolved", label: "Unresolved", count: unresolvedCount },
            { key: "resolved", label: "Resolved", count: resolvedCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-3 text-sm transition-colors ${
              filter === tab.key
                ? "border-b-2 border-accent-primary text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 text-xs">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredComments.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-text-tertiary">
              {filter === "all"
                ? "No comments yet"
                : filter === "unresolved"
                  ? "No unresolved comments"
                  : "No resolved comments"}
            </p>
            {filter === "all" && (
              <p className="mt-1 text-xs text-text-tertiary">
                Be the first to leave feedback
              </p>
            )}
          </div>
        ) : (
          filteredComments.map((comment) => {
            const replies = getReplies(comment.id);
            return (
              <div
                key={comment.id}
                ref={(el) => {
                  if (el) commentRefs.current.set(comment.id, el);
                  else commentRefs.current.delete(comment.id);
                }}
                className={`space-y-3 rounded-lg p-2 -m-2 transition-shadow duration-500 ${
                  comment.isResolved
                    ? "border-l-2 border-accent-secondary pl-3 opacity-50"
                    : ""
                } ${
                  highlightedId === comment.id
                    ? "ring-2 ring-accent-warning ring-offset-2 ring-offset-bg-secondary"
                    : ""
                }`}
              >
                {/* Root comment */}
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-white">
                    {getInitials(comment.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {comment.displayName}
                      </span>
                      {comment.timestamp != null && (
                        <button
                          onClick={() => onSeek?.(comment.timestamp!)}
                          className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-accent-primary transition-colors hover:bg-bg-input"
                        >
                          {formatTC(comment.timestamp)}
                        </button>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {relativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
                      {comment.text}
                    </p>
                    <div className="mt-2 flex gap-3">
                      <button
                        onClick={() =>
                          setReplyingTo(
                            replyingTo === comment.id ? null : comment.id,
                          )
                        }
                        className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
                      >
                        Reply
                      </button>
                      {isAuthenticated && !comment.parentId && (
                        <button
                          onClick={() =>
                            resolveComment(comment.id, !comment.isResolved)
                          }
                          className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
                        >
                          {comment.isResolved ? "Unresolve" : "Resolve"}
                        </button>
                      )}
                      {canDelete(comment) && (
                        <button
                          onClick={() => deleteComment(comment.id)}
                          disabled={deleting === comment.id}
                          className="text-xs text-text-tertiary transition-colors hover:text-accent-danger disabled:opacity-50"
                        >
                          {deleting === comment.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="ml-10 space-y-3 border-l border-border-default pl-4">
                    {replies.map((reply) => (
                      <div key={reply.id} className="flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/60 text-[10px] font-medium text-white">
                          {getInitials(reply.displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-primary">
                              {reply.displayName}
                            </span>
                            <span className="text-xs text-text-tertiary">
                              {relativeTime(reply.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-text-secondary whitespace-pre-wrap">
                            {reply.text}
                          </p>
                          {canDelete(reply) && (
                            <button
                              onClick={() => deleteComment(reply.id)}
                              disabled={deleting === reply.id}
                              className="mt-1 text-xs text-text-tertiary transition-colors hover:text-accent-danger disabled:opacity-50"
                            >
                              {deleting === reply.id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply input */}
                {replyingTo === comment.id && (
                  <div className="ml-10 flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitReply(comment.id);
                        }
                      }}
                      placeholder="Write a reply..."
                      className="flex-1 rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
                    />
                    <button
                      onClick={() => submitReply(comment.id)}
                      disabled={submitting || !replyText.trim()}
                      className="shrink-0 rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New comment input */}
      <div className="border-t border-border-default p-4">
        {error && (
          <div className="mb-2 text-xs text-accent-danger">{error}</div>
        )}
        <div className="flex items-center gap-2">
          {videoStatus === "ready" && (
            <span className="shrink-0 rounded bg-bg-tertiary px-2 py-1 font-mono text-xs text-accent-primary">
              {formatTC(currentTime)}
            </span>
          )}
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
            }}
            placeholder={
              videoStatus === "ready"
                ? `Add a comment at ${formatTC(currentTime)}...`
                : "Add a comment..."
            }
            className="flex-1 rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          />
          <button
            onClick={submitComment}
            disabled={submitting || !newComment.trim()}
            className="shrink-0 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
