import { useState, useEffect, useRef, useCallback } from "react";
import { CommentTimeline } from "./CommentTimeline";
import { CommentThread } from "./CommentThread";

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

interface VideoDetailViewProps {
  videoId: string;
  streamVideoId: string | null;
  status: string;
  duration: number | null;
  initialComments: Comment[];
  currentUserId: string;
  currentUserName: string;
}

// Wait for the Stream SDK to be available on window. Resolves when found,
// rejects after timeoutMs.
function waitForStream(timeoutMs = 5000): Promise<NonNullable<Window["Stream"]>> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Stream) {
      resolve(window.Stream);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && window.Stream) {
        clearInterval(interval);
        resolve(window.Stream);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Stream SDK did not load in time"));
      }
    }, 50);
  });
}

export function VideoDetailView({
  videoId,
  streamVideoId,
  status,
  duration,
  initialComments,
  currentUserId,
  currentUserName,
}: VideoDetailViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(duration || 0);
  const [processingStatus, setProcessingStatus] = useState(status);
  const [liveComments, setLiveComments] = useState(initialComments);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, [processingStatus, videoId]);

  // Initialize Stream player SDK and subscribe to events
  useEffect(() => {
    if (processingStatus !== "ready" || !streamVideoId) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cancelled = false;
    let player: StreamPlayer | null = null;

    const handleTimeUpdate = () => {
      if (player) setCurrentTime(player.currentTime || 0);
    };
    const handleDurationChange = () => {
      if (player) setVideoDuration(player.duration || 0);
    };
    const handlePause = () => {
      // Per PRD: pausing should populate the comment input timecode.
      // Forcing a state sync ensures the latest exact pause position is captured.
      if (player) setCurrentTime(player.currentTime || 0);
    };

    waitForStream()
      .then((StreamFn) => {
        if (cancelled || !iframeRef.current) return;
        player = StreamFn(iframeRef.current);
        playerRef.current = player;

        player.addEventListener("timeupdate", handleTimeUpdate);
        player.addEventListener("durationchange", handleDurationChange);
        player.addEventListener("pause", handlePause);

        // Initial duration sync (in case durationchange fired before subscribe)
        if (player.duration) {
          setVideoDuration(player.duration);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Stream SDK:", err);
      });

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.removeEventListener("timeupdate", handleTimeUpdate);
          player.removeEventListener("durationchange", handleDurationChange);
          player.removeEventListener("pause", handlePause);
        } catch {
          // ignore
        }
      }
      playerRef.current = null;
    };
  }, [processingStatus, streamVideoId]);

  const handleSeek = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Render player
  const renderPlayer = () => {
    if (processingStatus === "processing") {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-accent-warning/30" />
            <p className="text-lg font-semibold text-text-primary">
              Your video is being processed...
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              This usually takes a few minutes
            </p>
          </div>
        </div>
      );
    }

    if (processingStatus === "failed") {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
          <div className="text-center">
            <p className="text-lg font-semibold text-accent-danger">Processing failed</p>
            <p className="mt-1 text-sm text-text-secondary">
              There was an error processing your video
            </p>
          </div>
        </div>
      );
    }

    if (!streamVideoId) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
          <p className="text-text-tertiary">No video available</p>
        </div>
      );
    }

    return (
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          ref={iframeRef}
          src={`https://iframe.videodelivery.net/${streamVideoId}`}
          className="h-full w-full"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
      {/* Left Column: Player + Timeline */}
      <div className="space-y-6">
        {renderPlayer()}

        {processingStatus === "ready" && videoDuration > 0 && (
          <CommentTimeline
            comments={liveComments.filter((c) => !c.parentId && c.timestamp != null)}
            duration={videoDuration}
            currentTime={currentTime}
            onSeek={handleSeek}
            onCommentClick={handleCommentClick}
          />
        )}
      </div>

      {/* Right Column: Comments */}
      <div className="flex flex-col rounded-xl border border-border-default bg-bg-secondary">
        <CommentThread
          videoId={videoId}
          initialComments={initialComments}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isAuthenticated={true}
          duration={videoDuration}
          videoStatus={processingStatus}
          currentTime={currentTime}
          onSeek={handleSeek}
          onCommentsChange={setLiveComments}
          focusRequest={focusRequest}
        />
      </div>
    </div>
  );
}
