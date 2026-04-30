import { useState, useEffect, useRef, useCallback } from "react";
import { formatTimecode, relativeTime } from "../lib/time";
import { connectVideoRoom } from "../lib/realtime";
import type { Viewer } from "../lib/realtime";
import { PresenceBar } from "./PresenceBar";
import { AnnotationToolbar } from "./AnnotationOverlay";
import type { AnnotationTool } from "./AnnotationOverlay";
import type {
  Annotation,
  Comment,
  CommentReactionEmoji,
  CommentUrgency,
  FocusRequest,
} from "../types";
import { COMMENT_REACTION_EMOJIS } from "../types";

/**
 * Visual + display config for each urgency level. The colored dot is the
 * only place urgency colour appears in the UI; surrounding text and pills
 * use neutral tokens so urgency reads as metadata rather than a primary
 * action.
 */
const URGENCY_META: Record<
  CommentUrgency,
  { label: string; description: string; dot: string }
> = {
  idea: {
    label: "Idea",
    description: "Concept to consider",
    dot: "bg-accent-primary",
  },
  suggestion: {
    label: "Suggestion",
    description: "Optional, nice-to-have",
    dot: "bg-accent-info",
  },
  important: {
    label: "Important",
    description: "Should be addressed",
    dot: "bg-accent-warning",
  },
  critical: {
    label: "Critical",
    description: "Must be fixed",
    dot: "bg-accent-danger",
  },
};

// Listed from lowest to highest severity so the dropdown reads naturally.
const URGENCY_OPTIONS: CommentUrgency[] = [
  "idea",
  "suggestion",
  "important",
  "critical",
];

function ReactionBar({
  comment,
  disabled,
  onToggle,
}: {
  comment: Comment;
  disabled: boolean;
  onToggle: (commentId: string, emoji: CommentReactionEmoji) => void;
}) {
  const reactions = comment.reactions ?? [];

  if (reactions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(comment.id, reaction.emoji)}
          className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            reaction.reactedByMe
              ? "border-accent-primary bg-accent-primary/15 text-text-primary"
              : "border-border-default bg-bg-tertiary text-text-secondary hover:bg-bg-input"
          }`}
          aria-pressed={reaction.reactedByMe}
          title={`${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

function ReactionAddButton({
  comment,
  disabled,
  onToggle,
}: {
  comment: Comment;
  disabled: boolean;
  onToggle: (commentId: string, emoji: CommentReactionEmoji) => void;
}) {
  const [open, setOpen] = useState(false);
  const reactions = comment.reactions ?? [];
  const visibleEmoji = new Set(reactions.map((reaction) => reaction.emoji));
  const hiddenOptions = COMMENT_REACTION_EMOJIS.filter(
    (emoji) => !visibleEmoji.has(emoji),
  );

  if (disabled || hiddenOptions.length === 0) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
        aria-label="Add reaction"
        aria-expanded={open}
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-full border border-border-default bg-bg-secondary p-1 shadow-lg">
          {hiddenOptions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggle(comment.id, emoji);
                setOpen(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-bg-tertiary"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Compact urgency picker: shows a colored dot + label (label hides on
 * narrow screens) and opens a small popover with the three options on
 * click. Closes on outside click, escape key, or selection.
 */
function UrgencyPicker({
  value,
  onChange,
}: {
  value: CommentUrgency;
  onChange: (next: CommentUrgency) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    URGENCY_OPTIONS.indexOf(value),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync the keyboard focus index when the popover opens.
  useEffect(() => {
    if (open) setActiveIndex(URGENCY_OPTIONS.indexOf(value));
  }, [open, value]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % URGENCY_OPTIONS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          i <= 0 ? URGENCY_OPTIONS.length - 1 : i - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const next = URGENCY_OPTIONS[activeIndex];
        if (next) {
          onChange(next);
          setOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, activeIndex, onChange]);

  const meta = URGENCY_META[value];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Urgency: ${meta.label}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-bg-tertiary px-2 text-xs text-text-secondary transition-colors hover:bg-bg-input focus:border-accent-primary focus:outline-none"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <span className="hidden sm:inline">{meta.label}</span>
        <svg
          className="h-3 w-3 shrink-0 text-text-tertiary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select comment urgency"
          className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-border-default bg-bg-secondary shadow-lg"
        >
          {URGENCY_OPTIONS.map((level, index) => {
            const optionMeta = URGENCY_META[level];
            const selected = level === value;
            const active = index === activeIndex;
            return (
              <div
                key={level}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                className={`group/row flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  active ? "bg-bg-tertiary" : "bg-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(level);
                    setOpen(false);
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${optionMeta.dot}`}
                  />
                  <span className="font-medium text-text-primary">
                    {optionMeta.label}
                  </span>
                  {selected && (
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/*
                  Info icon: reveals the description on hover or keyboard
                  focus via the sibling group-hover/group-focus utilities.
                  The tooltip content also doubles as the title attribute so
                  it is accessible to screen readers and pointer-less users.
                  Always pinned to the right of the row so its position is
                  stable across selected and unselected states.
                */}
                <span className="relative inline-flex">
                  <span
                    tabIndex={0}
                    role="button"
                    aria-label={`${optionMeta.label}: ${optionMeta.description}`}
                    title={optionMeta.description}
                    className="peer inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary focus:text-text-secondary focus:outline-none"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-44 rounded-md border border-border-default bg-bg-primary px-2.5 py-1.5 text-[11px] text-text-secondary shadow-lg peer-hover:block peer-focus:block"
                  >
                    {optionMeta.description}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  /** Annotation placed by the user that should be attached to the next comment. */
  pendingAnnotation?: Annotation | null;
  /** Called after a comment with an annotation is submitted (to clear overlay state). */
  onAnnotationClear?: () => void;
  /** Called when hovering over a comment that has an annotation. */
  onCommentHover?: (commentId: string | null) => void;
  /** Currently active annotation drawing tool. */
  activeTool?: AnnotationTool;
  /** Callback to change the active annotation tool. */
  onToolChange?: (tool: AnnotationTool) => void;
  /** When true, the comment form is hidden (e.g. published videos). */
  readOnly?: boolean;
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
  pendingAnnotation,
  onAnnotationClear,
  onCommentHover,
  activeTool = "none",
  onToolChange,
  readOnly = false,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [filter, setFilter] = useState<FilterType>("all");
  const [newComment, setNewComment] = useState("");
  const [newCommentUrgency, setNewCommentUrgency] =
    useState<CommentUrgency>("suggestion");
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
    const refreshComments = async () => {
      try {
        const baseUrl = shareToken
          ? `/api/share/${shareToken}/comments`
          : `/api/videos/${videoId}/comments`;
        const pollUrl = new URL(baseUrl, window.location.origin);
        const res = await fetch(pollUrl.toString());
        if (res.ok) {
          const data = await res.json();
          if (data.comments && data.comments.length > 0) {
            setComments((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              const reviewComments = data.comments.filter((c: Comment) => c.phase !== "script");
              const newOnes = data.comments.filter(
                (c: Comment) => c.phase !== "script" && !existingIds.has(c.id),
              );
              // Also update resolved status for existing comments
              const updated = prev.map((existing) => {
                const updatedComment = reviewComments.find(
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
    };

    refreshComments();
    const interval = setInterval(refreshComments, 10000);

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
          if (incoming.phase === "script") return;
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
        onCommentReactions: (update) => {
          setComments((prev) =>
            prev.map((comment) =>
              comment.id === update.commentId
                ? {
                    ...comment,
                    reactions: update.reactions.map((reaction) => ({
                      ...reaction,
                      reactedByMe:
                        comment.reactions?.find((r) => r.emoji === reaction.emoji)
                          ?.reactedByMe ?? false,
                    })),
                  }
                : comment,
            ),
          );
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
        urgency: newCommentUrgency,
      };

      if (pendingAnnotation) {
        body.annotation = pendingAnnotation;
      }

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
        setComments((prev) => {
          if (prev.some((c) => c.id === data.comment.id)) return prev;
          return sortComments([...prev, data.comment]);
        });
        setNewComment("");
        setNewCommentUrgency("suggestion");
        onAnnotationClear?.();
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
        setComments((prev) => {
          if (prev.some((c) => c.id === data.comment.id)) return prev;
          return sortComments([...prev, data.comment]);
        });
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

  const toggleReaction = async (
    commentId: string,
    emoji: CommentReactionEmoji,
  ) => {
    if (readOnly || !isAuthenticated) return;

    try {
      const res = await fetch(`/api/comments/${commentId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });

      if (res.ok) {
        const update = await res.json();
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === update.commentId
              ? { ...comment, reactions: update.reactions }
              : comment,
          ),
        );
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update reaction.");
      }
    } catch {
      setError("Failed to update reaction.");
    }
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
            const hasAnnotation = !!comment.annotation;
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
                onMouseEnter={() => hasAnnotation && onCommentHover?.(comment.id)}
                onMouseLeave={() => hasAnnotation && onCommentHover?.(null)}
              >
                {/* Root comment */}
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-white">
                    {getInitials(comment.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {comment.displayName}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                        title={`${URGENCY_META[comment.urgency].label} comment`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_META[comment.urgency].dot}`}
                          aria-hidden="true"
                        />
                        {URGENCY_META[comment.urgency].label}
                      </span>
                      {comment.timestamp != null && (
                        <button
                          onClick={() => onSeek?.(comment.timestamp!)}
                          className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-accent-primary transition-colors hover:bg-bg-input"
                        >
                          {formatTC(comment.timestamp)}
                        </button>
                      )}
                      {hasAnnotation && (
                        <span
                          title={comment.annotation!.type === "point" ? "Pin annotation" : "Rectangle annotation"}
                          className="inline-flex items-center rounded bg-accent-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-danger"
                        >
                          {comment.annotation!.type === "point" ? (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                            </svg>
                          )}
                        </span>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {relativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
                      {comment.text}
                    </p>
                    <ReactionBar
                      comment={comment}
                      disabled={readOnly || !isAuthenticated}
                      onToggle={toggleReaction}
                    />
                    <div className="mt-2 flex gap-3">
                      <ReactionAddButton
                        comment={comment}
                        disabled={readOnly || !isAuthenticated}
                        onToggle={toggleReaction}
                      />
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
                          <ReactionBar
                            comment={reply}
                            disabled={readOnly || !isAuthenticated}
                            onToggle={toggleReaction}
                          />
                          {(!readOnly && isAuthenticated) || canDelete(reply) ? (
                            <div className="mt-1 flex gap-3">
                              <ReactionAddButton
                                comment={reply}
                                disabled={readOnly || !isAuthenticated}
                                onToggle={toggleReaction}
                              />
                              {canDelete(reply) && (
                                <button
                                  onClick={() => deleteComment(reply.id)}
                                  disabled={deleting === reply.id}
                                  className="text-xs text-text-tertiary transition-colors hover:text-accent-danger disabled:opacity-50"
                                >
                                  {deleting === reply.id ? "Deleting..." : "Delete"}
                                </button>
                              )}
                            </div>
                          ) : null}
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
      {readOnly ? (
        <div className="border-t border-border-default px-4 py-3 text-center text-xs text-text-tertiary">
          Comments are locked on published videos.
        </div>
      ) : (
      <div className="min-w-0 border-t border-border-default p-4">
        {error && (
          <div className="mb-2 text-xs text-accent-danger">{error}</div>
        )}
        {/* Pending annotation indicator */}
        {pendingAnnotation && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-accent-danger/10 px-3 py-1.5 text-xs text-accent-danger">
            {pendingAnnotation.type === "point" ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            )}
            <span>
              {pendingAnnotation.type === "point" ? "Pin" : "Rectangle"} annotation attached
            </span>
            <button
              type="button"
              onClick={() => onAnnotationClear?.()}
              className="ml-auto text-accent-danger/70 hover:text-accent-danger"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {/*
          Compose toolbar row. Renders annotation tools + timecode when the
          video is ready; the urgency picker always renders so reviewers can
          tag urgency even before processing finishes.
        */}
        <div className="mb-2 flex w-full flex-wrap items-center gap-2">
          {videoStatus === "ready" && onToolChange && (
            <>
              <AnnotationToolbar activeTool={activeTool} onToolChange={onToolChange} />
              <span className="rounded bg-bg-tertiary px-2 py-1 font-mono text-xs text-accent-primary">
                {formatTC(currentTime)}
              </span>
            </>
          )}
          <UrgencyPicker
            value={newCommentUrgency}
            onChange={setNewCommentUrgency}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitComment();
              }
            }}
            placeholder={
              pendingAnnotation
                ? "Describe what you see here..."
                : videoStatus === "ready"
                  ? `Add a comment at ${formatTC(currentTime)}...`
                  : "Add a comment..."
            }
            className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
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
      )}
    </div>
  );
}
