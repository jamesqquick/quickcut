import { useState, useRef, useCallback, useEffect } from "react";
import type { Annotation, Comment } from "../types";

export type AnnotationTool = "none" | "point" | "rect";

interface AnnotationOverlayProps {
  /** All comments for the current video (used to render existing annotations). */
  comments: Comment[];
  /** Current playback time in seconds. */
  currentTime: number;
  /** Currently selected annotation tool. */
  activeTool: AnnotationTool;
  /** Called when the user places/draws an annotation. */
  onAnnotationCreate: (annotation: Annotation) => void;
  /** Called when user clicks an existing annotation marker. */
  onAnnotationClick?: (commentId: string) => void;
  /** Comment ID to highlight (e.g. when hovering a comment in the thread). */
  highlightedCommentId?: string | null;
  /** Tolerance in seconds for matching comments to the current frame. */
  timeTolerance?: number;
}

/** How close (in seconds) a comment's timestamp must be to show its annotation. */
const DEFAULT_TIME_TOLERANCE = 0.5;

const ANNOTATION_COLOR = "#E74A3C";
const ANNOTATION_COLOR_RESOLVED = "#22C55E";

export function AnnotationOverlay({
  comments,
  currentTime,
  activeTool,
  onAnnotationCreate,
  onAnnotationClick,
  highlightedCommentId,
  timeTolerance = DEFAULT_TIME_TOLERANCE,
}: AnnotationOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null);

  // Get normalized coordinates from a mouse/pointer event
  const getNormalizedCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // Clear pending state when tool changes
  useEffect(() => {
    setPendingAnnotation(null);
    setDragStart(null);
    setDragCurrent(null);
  }, [activeTool]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === "none") return;
      e.preventDefault();
      e.stopPropagation();

      const coords = getNormalizedCoords(e);
      if (!coords) return;

      if (activeTool === "point") {
        const annotation: Annotation = { type: "point", x: coords.x, y: coords.y };
        setPendingAnnotation(annotation);
        onAnnotationCreate(annotation);
      } else if (activeTool === "rect") {
        setDragStart(coords);
        setDragCurrent(coords);
      }
    },
    [activeTool, getNormalizedCoords, onAnnotationCreate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== "rect" || !dragStart) return;
      e.preventDefault();
      const coords = getNormalizedCoords(e);
      if (coords) setDragCurrent(coords);
    },
    [activeTool, dragStart, getNormalizedCoords],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== "rect" || !dragStart || !dragCurrent) return;
      e.preventDefault();
      e.stopPropagation();

      // Normalize so x/y is always top-left and w/h are positive
      const x = Math.min(dragStart.x, dragCurrent.x);
      const y = Math.min(dragStart.y, dragCurrent.y);
      const w = Math.abs(dragCurrent.x - dragStart.x);
      const h = Math.abs(dragCurrent.y - dragStart.y);

      // Ignore tiny drags (likely accidental clicks)
      if (w > 0.01 || h > 0.01) {
        const annotation: Annotation = { type: "rect", x, y, w, h };
        setPendingAnnotation(annotation);
        onAnnotationCreate(annotation);
      }

      setDragStart(null);
      setDragCurrent(null);
    },
    [activeTool, dragStart, dragCurrent, onAnnotationCreate],
  );

  // Comments whose annotations should be visible at the current frame
  const visibleComments = comments.filter((c) => {
    if (!c.annotation || c.parentId) return false;
    if (c.timestamp == null) return false;
    return Math.abs(c.timestamp - currentTime) <= timeTolerance;
  });

  // Build the live drag preview rect
  const dragRect =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          w: Math.abs(dragCurrent.x - dragStart.x),
          h: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  const isInteractive = activeTool !== "none";

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{
        pointerEvents: isInteractive ? "auto" : "none",
        cursor: activeTool === "point" ? "crosshair" : activeTool === "rect" ? "crosshair" : "default",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Pin annotations rendered as HTML so they aren't distorted by the
           stretched SVG viewBox (preserveAspectRatio="none"). */}
      {visibleComments
        .filter((c) => c.annotation!.type === "point")
        .map((comment) => {
          const a = comment.annotation!;
          const color = comment.isResolved ? ANNOTATION_COLOR_RESOLVED : ANNOTATION_COLOR;
          const isHighlighted = highlightedCommentId === comment.id;
          const PIN_SIZE = 28;
          return (
            <div
              key={comment.id}
              onClick={() => onAnnotationClick?.(comment.id)}
              style={{
                position: "absolute",
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                transform: "translate(-50%, -100%)",
                pointerEvents: "auto",
                cursor: "pointer",
                opacity: isHighlighted ? 1 : 0.8,
                filter: isHighlighted
                  ? `drop-shadow(0 0 4px ${color})`
                  : "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
                transition: "filter 0.2s, opacity 0.2s",
              }}
            >
              <svg
                width={PIN_SIZE}
                height={PIN_SIZE}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color }}
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill={color} stroke="white" strokeWidth="1.5" />
                <circle cx="12" cy="10" r="3" fill="white" opacity="0.9" stroke="none" />
              </svg>
            </div>
          );
        })}

      {/* Pending pin annotation */}
      {pendingAnnotation?.type === "point" && (
        <div
          style={{
            position: "absolute",
            left: `${pendingAnnotation.x * 100}%`,
            top: `${pendingAnnotation.y * 100}%`,
            transform: "translate(-50%, -100%)",
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
            animation: "pulse-pin 1.5s ease-in-out infinite",
          }}
        >
          <svg
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: ANNOTATION_COLOR }}
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill={ANNOTATION_COLOR} stroke="white" strokeWidth="1.5" />
            <circle cx="12" cy="10" r="3" fill="white" opacity="0.9" />
          </svg>
          <style>{`@keyframes pulse-pin { 0%,100% { opacity: 0.9; } 50% { opacity: 0.5; } }`}</style>
        </div>
      )}

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {/* Rect annotations stay in the stretched SVG — rectangles render correctly here */}
        {visibleComments
          .filter((c) => c.annotation!.type === "rect")
          .map((comment) => {
            const a = comment.annotation!;
            if (a.type !== "rect") return null;
            const color = comment.isResolved ? ANNOTATION_COLOR_RESOLVED : ANNOTATION_COLOR;
            const isHighlighted = highlightedCommentId === comment.id;
            const opacity = isHighlighted ? 1 : 0.8;
            return (
              <g key={comment.id} style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={() => onAnnotationClick?.(comment.id)}>
                <rect
                  x={a.x}
                  y={a.y}
                  width={a.w}
                  height={a.h}
                  fill={isHighlighted ? color : "transparent"}
                  fillOpacity={isHighlighted ? 0.1 : 0}
                  stroke={color}
                  strokeWidth={0.004}
                  opacity={opacity}
                  rx={0.005}
                />
              </g>
            );
          })}
        {pendingAnnotation?.type === "rect" && (
          <rect
            x={pendingAnnotation.x}
            y={pendingAnnotation.y}
            width={pendingAnnotation.w}
            height={pendingAnnotation.h}
            fill={ANNOTATION_COLOR}
            fillOpacity={0.08}
            stroke={ANNOTATION_COLOR}
            strokeWidth={0.004}
            strokeDasharray="0.01 0.006"
            rx={0.005}
          />
        )}

        {/* Live drag preview */}
        {dragRect && (
          <rect
            x={dragRect.x}
            y={dragRect.y}
            width={dragRect.w}
            height={dragRect.h}
            fill={ANNOTATION_COLOR}
            fillOpacity={0.08}
            stroke={ANNOTATION_COLOR}
            strokeWidth={0.003}
            strokeDasharray="0.01 0.006"
            rx={0.005}
          />
        )}
      </svg>
    </div>
  );
}

/** Toolbar for selecting annotation tools. */
export function AnnotationToolbar({
  activeTool,
  onToolChange,
}: {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        title="Pin annotation"
        onClick={() => onToolChange(activeTool === "point" ? "none" : "point")}
        className={`rounded p-1.5 transition-colors ${
          activeTool === "point"
            ? "bg-accent-primary text-white"
            : "text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
        }`}
      >
        {/* Map pin icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </button>
      <button
        type="button"
        title="Rectangle annotation"
        onClick={() => onToolChange(activeTool === "rect" ? "none" : "rect")}
        className={`rounded p-1.5 transition-colors ${
          activeTool === "rect"
            ? "bg-accent-primary text-white"
            : "text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
        }`}
      >
        {/* Rectangle/square icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </button>
    </div>
  );
}
