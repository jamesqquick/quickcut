import { useState, useEffect, useRef, useCallback } from "react";
import { CommentTimeline } from "./CommentTimeline";
import { CommentThread } from "./CommentThread";
import { InlineEditor } from "./InlineEditor";
import { VideoPlayer } from "./VideoPlayer";
import { VideoPageLayout } from "./VideoPageLayout";
import { useStreamPlayer } from "../hooks/useStreamPlayer";
import type { Comment } from "../types";

interface VideoDetailViewProps {
  videoId: string;
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
    processing: "bg-accent-warning/15 text-accent-warning",
    ready: "bg-accent-secondary/15 text-accent-secondary",
    failed: "bg-accent-danger/15 text-accent-danger",
  };
  const labels: Record<string, string> = {
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
  fileName,
}: VideoDetailViewProps) {
  const [processingStatus, setProcessingStatus] = useState(status);
  const [liveComments, setLiveComments] = useState(initialComments);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { iframeRef, currentTime, videoDuration, setVideoDuration, handleSeek } = useStreamPlayer({
    status: processingStatus,
    streamVideoId,
    initialDuration: duration || 0,
  });

  const handleCommentClick = useCallback((commentId: string) => {
    setFocusRequest({ id: commentId, nonce: Date.now() });
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

  const leftColumn = (
    <>
      <VideoPlayer
        status={processingStatus}
        streamVideoId={streamVideoId}
        iframeRef={iframeRef}
      />

      {processingStatus === "ready" && videoDuration > 0 && (
        <CommentTimeline
          comments={liveComments.filter((c) => !c.parentId && c.timestamp != null)}
          duration={videoDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
          onCommentClick={handleCommentClick}
        />
      )}

      {/* Metadata: upload date, duration, filename */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Uploaded {formatDate(uploadDate)}
        </span>
        {videoDuration > 0 && (
          <span className="inline-flex items-center gap-1">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            {formatDuration(videoDuration)}
          </span>
        )}
        {fileName && (
          <span className="inline-flex w-full items-center gap-1 truncate sm:w-auto sm:max-w-[260px]">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
            {fileName}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex flex-wrap items-center gap-3">
        <InlineEditor
          value={title}
          field="title"
          videoId={videoId}
          isOwner={isOwner}
          as="h1"
          className="min-w-0 break-words text-xl font-bold text-text-primary sm:text-2xl"
        />
        {processingStatus !== "ready" && <StatusBadge status={processingStatus} />}
      </div>

      {/* Description */}
      <InlineEditor
        value={description}
        field="description"
        videoId={videoId}
        isOwner={isOwner}
        placeholder="Add a description..."
        className="break-words text-sm text-text-secondary"
      />
    </>
  );

  const rightColumn = (
    <CommentThread
      videoId={videoId}
      initialComments={initialComments}
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
    />
  );

  return <VideoPageLayout leftColumn={leftColumn} rightColumn={rightColumn} />;
}
