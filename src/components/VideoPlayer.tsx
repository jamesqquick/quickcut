import { useEffect, useRef, useState, useCallback } from "react";

interface VideoPlayerProps {
  streamVideoId: string | null;
  status: string;
  duration: number | null;
  onTimeUpdate?: (time: number) => void;
  onPause?: (time: number) => void;
  onDurationReady?: (duration: number) => void;
  seekTo?: number | null;
}

export function VideoPlayer({
  streamVideoId,
  status,
  duration: initialDuration,
  onTimeUpdate,
  onPause,
  onDurationReady,
  seekTo,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(initialDuration || 0);
  const [processingStatus, setProcessingStatus] = useState(status);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for video status when processing
  useEffect(() => {
    if (processingStatus !== "processing") return;

    const videoId = new URL(window.location.href).pathname.split("/").pop();
    if (!videoId) return;

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
        // Ignore polling errors
      }
    };

    pollIntervalRef.current = setInterval(poll, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [processingStatus]);

  // Listen for Stream player messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "timeupdate" && typeof event.data.time === "number") {
        setCurrentTime(event.data.time);
        onTimeUpdate?.(event.data.time);
      }
      if (event.data.type === "pause" && typeof event.data.time === "number") {
        onPause?.(event.data.time);
      }
      if (event.data.type === "durationchange" && typeof event.data.duration === "number") {
        setVideoDuration(event.data.duration);
        onDurationReady?.(event.data.duration);
      }
      if (event.data.type === "loadeddata") {
        setIsReady(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onTimeUpdate, onPause, onDurationReady]);

  // Handle seek requests
  useEffect(() => {
    if (seekTo != null && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "seek", time: seekTo },
        "*",
      );
    }
  }, [seekTo]);

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
          <p className="text-lg font-semibold text-accent-danger">
            Processing failed
          </p>
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
}
