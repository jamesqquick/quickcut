import { useState, useEffect, useRef, useCallback } from "react";

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

interface UseStreamPlayerOptions {
  status: string;
  streamVideoId: string | null;
  initialDuration: number;
  /** When false, delays SDK initialization (e.g. waiting for a name gate). */
  enabled?: boolean;
}

export function useStreamPlayer({
  status,
  streamVideoId,
  initialDuration,
  enabled = true,
}: UseStreamPlayerOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<StreamPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(initialDuration);

  useEffect(() => {
    if (!enabled) return;
    if (status !== "ready" || !streamVideoId) return;
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
  }, [enabled, status, streamVideoId]);

  const handleSeek = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return { iframeRef, currentTime, videoDuration, setVideoDuration, handleSeek };
}
