import { useState, useCallback, useRef } from "react";
import { formatTimecode } from "../lib/time";
import type { CommentUrgency } from "../types";

interface TimelineComment {
  id: string;
  timestamp: number | null;
  text: string;
  name: string;
  isResolved: boolean;
  urgency: CommentUrgency;
}

interface CommentTimelineProps {
  comments: TimelineComment[];
  duration: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onCommentClick?: (commentId: string) => void;
}

/**
 * Tailwind class for an unresolved marker, keyed by urgency. Resolved
 * markers always render in the muted secondary color so reviewers can
 * still distinguish completed feedback at a glance.
 */
const URGENCY_DOT: Record<CommentUrgency, string> = {
  idea: "bg-accent-primary",
  suggestion: "bg-accent-info",
  important: "bg-accent-warning",
  critical: "bg-accent-danger",
};

export function CommentTimeline({
  comments,
  duration,
  currentTime = 0,
  onSeek,
  onCommentClick,
}: CommentTimelineProps) {
  const [hoveredComment, setHoveredComment] = useState<TimelineComment | null>(null);
  const [tooltipPos, setTooltipPos] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const barRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);

  const computeTimeFromClientX = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar) return 0;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleMarkerHover = useCallback(
    (comment: TimelineComment, e: React.MouseEvent) => {
      setHoveredComment(comment);
      setHoverTime(null);
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      if (rect) {
        setTooltipPos(e.clientX - rect.left);
      }
    },
    [],
  );

  const handleMarkerClick = useCallback(
    (comment: TimelineComment) => {
      if (comment.timestamp != null) {
        onSeek?.(comment.timestamp);
      }
      onCommentClick?.(comment.id);
    },
    [onSeek, onCommentClick],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      scrubbingRef.current = true;
      onSeek?.(computeTimeFromClientX(e.clientX));

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!scrubbingRef.current) return;
        onSeek?.(computeTimeFromClientX(moveEvent.clientX));
      };

      const handleMouseUp = () => {
        scrubbingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [computeTimeFromClientX, onSeek],
  );

  const handleBarMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (scrubbingRef.current) return;
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      setHoverTime(computeTimeFromClientX(e.clientX));
      setHoverX(e.clientX - rect.left);
    },
    [computeTimeFromClientX],
  );

  const handleBarMouseLeave = useCallback(() => {
    setHoverTime(null);
    setHoveredComment(null);
  }, []);

  if (!duration || duration === 0) return null;

  const progressPercent = (currentTime / duration) * 100;

  return (
    <div
      ref={barRef}
      className="relative h-8 cursor-pointer rounded-lg bg-bg-tertiary px-1 select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleBarMouseMove}
      onMouseLeave={handleBarMouseLeave}
    >
      {/* Progress fill */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-full rounded-lg bg-accent-primary/10"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Playhead */}
      <div
        className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2 bg-accent-primary"
        style={{ left: `${progressPercent}%` }}
      />

      {/* Comment markers */}
      {comments.map((comment) => {
        if (comment.timestamp == null) return null;
        const position = (comment.timestamp / duration) * 100;
        const dotColor = comment.isResolved
          ? "bg-accent-secondary"
          : URGENCY_DOT[comment.urgency];
        return (
          <button
            key={comment.id}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150 ${dotColor}`}
            style={{ left: `${position}%` }}
            onMouseEnter={(e) => handleMarkerHover(comment, e)}
            onMouseLeave={() => setHoveredComment(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleMarkerClick(comment);
            }}
            title={`${comment.name}: ${comment.text.slice(0, 60)}`}
          />
        );
      })}

      {/* Comment tooltip */}
      {hoveredComment && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-xs shadow-lg"
          style={{ left: `${tooltipPos}px` }}
        >
          <span className="font-medium text-text-primary">
            {hoveredComment.name}:
          </span>{" "}
          <span className="text-text-secondary">
            {hoveredComment.text.slice(0, 60)}
            {hoveredComment.text.length > 60 ? "..." : ""}
          </span>
        </div>
      )}

      {/* Time tooltip */}
      {hoverTime != null && !hoveredComment && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-secondary px-2 py-1 font-mono text-xs text-text-secondary shadow-lg"
          style={{ left: `${hoverX}px` }}
        >
          {formatTimecode(hoverTime)}
        </div>
      )}
    </div>
  );
}
