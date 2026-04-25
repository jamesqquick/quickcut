import { useState, useEffect, useRef, useCallback } from "react";
import { CommentTimeline } from "./CommentTimeline";
import { CommentThread } from "./CommentThread";
import { NamePromptModal } from "./NamePromptModal";

interface Video {
  id: string;
  title: string;
  description: string | null;
  status: string;
  streamVideoId: string | null;
  duration: number | null;
}

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

interface ShareViewProps {
  video: Video;
  initialComments: Comment[];
  shareToken: string;
}

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

export function ShareView({ video, initialComments, shareToken }: ShareViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const [anonymousName, setAnonymousName] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(video.duration || 0);
  const [liveComments, setLiveComments] = useState(initialComments);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);

  const handleCommentClick = useCallback((commentId: string) => {
    setFocusRequest({ id: commentId, nonce: Date.now() });
  }, []);

  // Load stored name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("quickcut_anonymous_name");
    if (stored) setAnonymousName(stored);
  }, []);

  // Track view
  useEffect(() => {
    fetch(`/api/share/${shareToken}/view`, { method: "POST" }).catch(() => {});
  }, [shareToken]);

  // Initialize Stream SDK
  useEffect(() => {
    if (video.status !== "ready" || !video.streamVideoId) return;
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
  }, [video.status, video.streamVideoId]);

  const handleSeek = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleNameSubmit = (name: string) => {
    setAnonymousName(name);
    localStorage.setItem("quickcut_anonymous_name", name);
    setShowNamePrompt(false);
  };

  const renderPlayer = () => {
    if (video.status === "processing") {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-accent-warning/30" />
            <p className="text-lg font-semibold text-text-primary">This video is still being processed</p>
            <p className="mt-1 text-sm text-text-secondary">Check back in a few minutes</p>
          </div>
        </div>
      );
    }

    if (video.status === "failed" || !video.streamVideoId) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
          <p className="text-text-tertiary">This video is no longer available</p>
        </div>
      );
    }

    return (
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          ref={iframeRef}
          src={`https://iframe.videodelivery.net/${video.streamVideoId}`}
          className="h-full w-full"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderPlayer()}

      {video.status === "ready" && videoDuration > 0 && (
        <CommentTimeline
          comments={liveComments.filter((c) => !c.parentId && c.timestamp != null)}
          duration={videoDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
          onCommentClick={handleCommentClick}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-text-primary">{video.title}</h1>
        {video.description && (
          <p className="mt-2 text-sm text-text-secondary">{video.description}</p>
        )}
      </div>

      <div className="rounded-xl border border-border-default bg-bg-secondary">
        <CommentThread
          videoId={video.id}
          initialComments={initialComments}
          isAuthenticated={false}
          duration={videoDuration}
          videoStatus={video.status}
          currentTime={currentTime}
          shareToken={shareToken}
          anonymousName={anonymousName || undefined}
          onSeek={handleSeek}
          onCommentsChange={setLiveComments}
          focusRequest={focusRequest}
        />
      </div>

      <NamePromptModal
        isOpen={showNamePrompt}
        onSubmit={handleNameSubmit}
        onClose={() => setShowNamePrompt(false)}
      />
    </div>
  );
}
