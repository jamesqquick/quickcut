import { useState, useCallback } from "react";

interface TimelineComment {
  id: string;
  timestamp: number | null;
  text: string;
  displayName: string;
  isResolved: boolean;
}

interface CommentTimelineProps {
  comments: TimelineComment[];
  duration: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onCommentClick?: (commentId: string) => void;
}

export function CommentTimeline({
  comments,
  duration,
  currentTime = 0,
  onSeek,
  onCommentClick,
}: CommentTimelineProps) {
  const [hoveredComment, setHoveredComment] = useState<TimelineComment | null>(null);
  const [tooltipPos, setTooltipPos] = useState(0);

  const handleMarkerHover = useCallback(
    (comment: TimelineComment, e: React.MouseEvent) => {
      setHoveredComment(comment);
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

  if (!duration || duration === 0) return null;

  const progressPercent = (currentTime / duration) * 100;

  return (
    <div className="relative h-8 rounded-lg bg-bg-tertiary px-1">
      {/* Progress indicator */}
      <div
        className="absolute left-0 top-0 h-full rounded-lg bg-accent-primary/10"
        style={{ width: `${progressPercent}%` }}
      />

      {/* Comment markers */}
      {comments.map((comment) => {
        if (comment.timestamp == null) return null;
        const position = (comment.timestamp / duration) * 100;
        return (
          <button
            key={comment.id}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150 ${
              comment.isResolved
                ? "bg-accent-secondary"
                : "bg-accent-warning"
            }`}
            style={{ left: `${position}%` }}
            onMouseEnter={(e) => handleMarkerHover(comment, e)}
            onMouseLeave={() => setHoveredComment(null)}
            onClick={() => handleMarkerClick(comment)}
            title={`${comment.displayName}: ${comment.text.slice(0, 60)}`}
          />
        );
      })}

      {/* Tooltip */}
      {hoveredComment && (
        <div
          className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-xs shadow-lg"
          style={{ left: `${tooltipPos}px` }}
        >
          <span className="font-medium text-text-primary">
            {hoveredComment.displayName}:
          </span>{" "}
          <span className="text-text-secondary">
            {hoveredComment.text.slice(0, 60)}
            {hoveredComment.text.length > 60 ? "..." : ""}
          </span>
        </div>
      )}
    </div>
  );
}
