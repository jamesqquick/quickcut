import { useState, useEffect, useRef, useCallback } from "react";
import { CommentTimeline } from "./CommentTimeline";
import { CommentThread } from "./CommentThread";
import { InlineEditor } from "./InlineEditor";
import { VideoPlayer } from "./VideoPlayer";
import { VideoPageLayout } from "./VideoPageLayout";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { TranscriptPanel } from "./TranscriptPanel";
import { ApprovalSection, type ApprovalStatus } from "./ApprovalSection";
import { ProjectPhaseControls } from "./ProjectPhaseControls";
import { TargetDateEditor } from "./TargetDateEditor";
import { ProjectActivityTimeline } from "./ProjectActivityTimeline";
import { useStreamPlayer } from "../hooks/useStreamPlayer";
import { normalizeVideoPhase, type Annotation, type Comment, type VideoPhase } from "../types";
import type { ProjectActivityItem } from "../lib/activity";
import type { AnnotationTool } from "./AnnotationOverlay";
import type { PipelineStep } from "./PhaseStepper";

interface VideoDetailViewProps {
  videoId: string;
  spaceId: string;
  streamVideoId: string | null;
  status: string;
  duration: number | null;
  initialComments: Comment[];
  currentUserId: string;
  currentUserName: string;
  title: string;
  description: string;
  isOwner: boolean;
  uploadDate: string;
  fileName: string | null;
  targetDate: string | null;
  transcriptsEnabled: boolean;
  uploadedBy: string | null;
  /** Null when the space has requiredApprovals = 0; the section is hidden. */
  initialApprovalStatus: ApprovalStatus | null;
  /** Current pipeline phase of the video. */
  initialPhase: string;
  /** Whether the space has pipeline mode enabled. */
  pipelineEnabled: boolean;
  /** Current user's role in the space (owner/member). */
  userRole: string;
  /** Workflow history for this project. */
  initialActivity: ProjectActivityItem[];
  /** Steps the user can currently navigate to in the guided workflow. */
  enabledSteps?: PipelineStep[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-accent-primary/15 text-accent-primary",
    processing: "bg-accent-warning/15 text-accent-warning",
    ready: "bg-accent-secondary/15 text-accent-secondary",
    failed: "bg-accent-danger/15 text-accent-danger",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    processing: "Processing",
    ready: "Ready",
    failed: "Failed",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || ""}`}
    >
      {status === "processing" && (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-accent-warning" />
      )}
      {labels[status] || status}
    </span>
  );
}

export function VideoDetailView({
  videoId,
  spaceId,
  streamVideoId,
  status,
  duration,
  initialComments,
  currentUserId,
  currentUserName,
  title,
  description,
  isOwner,
  uploadDate,
  targetDate,
  transcriptsEnabled,
  uploadedBy,
  initialApprovalStatus,
  initialPhase,
  pipelineEnabled,
  userRole,
  initialActivity,
  enabledSteps,
}: VideoDetailViewProps) {
  const initialReviewComments = initialComments.filter((comment) => comment.phase !== "script");
  const [processingStatus, setProcessingStatus] = useState(status);
  const [currentPhase, setCurrentPhase] = useState<VideoPhase>(() => normalizeVideoPhase(initialPhase));
  const [approvalStatus, setApprovalStatus] = useState(initialApprovalStatus);
  const [liveComments, setLiveComments] = useState(initialReviewComments);
  const isPublished = currentPhase === "published";
  const canChangePhase = pipelineEnabled && (userRole === "owner" || uploadedBy === currentUserId);
  const scriptLockedMessage = "This script is read-only because a video has been uploaded. Use the Video step for feedback on the cut.";
  const canMarkAsPublished = !isPublished && canChangePhase && (!approvalStatus || approvalStatus.isApproved);
  const primaryAction = canMarkAsPublished
    ? {
        type: "phase" as const,
        label: "Publish",
        phase: "published" as const,
        confirmMessage: "Publishing locks the video. Comments and versions become read-only.",
      }
    : null;
  const workflowTitle = isPublished ? "Published" : "Video";
  const workflowDescription = isPublished
    ? "This project is locked and ready to share."
    : approvalStatus && !approvalStatus.isApproved
      ? "Review the current cut and collect the required approvals before publishing."
      : "Review the current cut, collect feedback, and publish when ready.";
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool>("none");
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { iframeRef, currentTime, videoDuration, setVideoDuration, handleSeek } = useStreamPlayer({
    status: processingStatus,
    streamVideoId,
    initialDuration: duration || 0,
  });

  const handleCommentClick = useCallback((commentId: string) => {
    setFocusRequest({ id: commentId, nonce: Date.now() });
  }, []);

  const handleAnnotationCreate = useCallback((annotation: Annotation) => {
    setPendingAnnotation(annotation);
  }, []);

  const handleAnnotationClick = useCallback((commentId: string) => {
    setFocusRequest({ id: commentId, nonce: Date.now() });
  }, []);

  // Clear pending annotation after comment submission
  const handleAnnotationClear = useCallback(() => {
    setPendingAnnotation(null);
    setActiveTool("none");
  }, []);

  // Poll for video status when processing
  useEffect(() => {
    if (processingStatus !== "processing") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "ready" || data.status === "failed") {
            setProcessingStatus(data.status);
            if (data.duration) setVideoDuration(data.duration);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            if (data.status === "ready") {
              window.location.reload();
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    pollIntervalRef.current = setInterval(poll, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [processingStatus, videoId, setVideoDuration]);

  const annotationOverlay = processingStatus === "ready" ? (
    <AnnotationOverlay
      comments={liveComments}
      currentTime={currentTime}
      activeTool={activeTool}
      onAnnotationCreate={handleAnnotationCreate}
      onAnnotationClick={handleAnnotationClick}
      highlightedCommentId={highlightedCommentId}
    />
  ) : undefined;

  const topContent = pipelineEnabled ? (
    <div className="space-y-6">
      <ProjectPhaseControls
        videoId={videoId}
        initialPhase={currentPhase}
        title={workflowTitle}
        description={workflowDescription}
        enabledSteps={enabledSteps}
        lockedStepMessages={streamVideoId ? { script: scriptLockedMessage } : undefined}
        onPhaseChange={setCurrentPhase}
        primaryAction={primaryAction}
      />

      {isPublished && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-secondary/30 bg-accent-secondary/10 px-4 py-2 text-sm text-accent-secondary">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span>This video is published. Comments and versions are locked.</span>
        </div>
      )}
    </div>
  ) : undefined;

  const leftColumn = (
    <>
      <VideoPlayer
        status={processingStatus}
        streamVideoId={streamVideoId}
        iframeRef={iframeRef}
        overlay={annotationOverlay}
      />

      {/* Timeline row */}
      {processingStatus === "ready" && videoDuration > 0 && (
        <CommentTimeline
          comments={liveComments.filter((c) => !c.parentId && c.timestamp != null)}
          duration={videoDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
          onCommentClick={handleCommentClick}
        />
      )}

      {/* Title */}
      <div className="flex flex-wrap items-center gap-3">
        <InlineEditor
          value={title}
          field="title"
          videoId={videoId}
          isOwner={isOwner && !isPublished}
          as="h1"
          className="min-w-0 break-words text-xl font-bold text-text-primary sm:text-2xl"
        />
        {processingStatus !== "ready" && <StatusBadge status={processingStatus} />}
      </div>

      {/* Metadata: compact supporting details under the title. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Uploaded {formatDate(uploadDate)}
        </span>
        {videoDuration > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            {formatDuration(videoDuration)}
          </span>
        )}
        {pipelineEnabled && (
          <TargetDateEditor
            videoId={videoId}
            initialTargetDate={targetDate}
            canEdit={canChangePhase}
            variant="metadata"
          />
        )}
      </div>

      {/* Description */}
      <InlineEditor
        value={description}
        field="description"
        videoId={videoId}
        isOwner={isOwner && !isPublished}
        placeholder="Add a description..."
        className="break-words text-sm text-text-secondary"
      />

      {/* Approval status — shown inside Video when the space requires signoff. */}
      {approvalStatus && (
        <ApprovalSection
          videoId={videoId}
          initialStatus={approvalStatus}
          currentUserId={currentUserId}
          isSpaceMember={true}
          uploadedBy={uploadedBy}
          viewerName={currentUserName}
          readOnly={isPublished}
          onStatusChange={setApprovalStatus}
        />
      )}
    </>
  );

  const bottomContent = (
    <div className="space-y-6">
      <TranscriptPanel videoId={videoId} videoTitle={title} transcriptsEnabled={transcriptsEnabled} />
      {pipelineEnabled && <ProjectActivityTimeline activity={initialActivity} />}
    </div>
  );

  const rightColumn = (
    <CommentThread
      videoId={videoId}
      initialComments={initialReviewComments}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      isAuthenticated={true}
      duration={videoDuration}
      videoStatus={processingStatus}
      currentTime={currentTime}
      liveEnabled={processingStatus === "ready"}
      onSeek={handleSeek}
      onCommentsChange={setLiveComments}
      focusRequest={focusRequest}
      pendingAnnotation={pendingAnnotation}
      onAnnotationClear={handleAnnotationClear}
      onCommentHover={setHighlightedCommentId}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      readOnly={isPublished}
    />
  );

  return <VideoPageLayout topContent={topContent} leftColumn={leftColumn} rightColumn={rightColumn} bottomContent={bottomContent} />;
}
