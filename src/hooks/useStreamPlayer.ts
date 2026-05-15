import { useState, useEffect, useRef, useCallback } from "react";

function waitForStream(timeoutMs = 5000): Promise<NonNullable<Window["Stream"]>> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Stream SDK is only available in the browser"));
      return;
    }
    if (window.Stream) {
      resolve(window.Stream);
      return;
    }

    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="embed.cloudflarestream.com"]',
    );

    let timeoutId: number | undefined;
    let cleanup: () => void = () => {};

    const onReady = () => {
      cleanup();
      if (window.Stream) {
        resolve(window.Stream);
      } else {
        reject(new Error("Stream SDK loaded but window.Stream is undefined"));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("Stream SDK failed to load"));
    };

    cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      script?.removeEventListener("load", onReady);
      script?.removeEventListener("error", onError);
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Stream SDK did not load in time"));
    }, timeoutMs);

    if (script) {
      script.addEventListener("load", onReady);
      script.addEventListener("error", onError);
    } else {
      // Script tag isn't in the DOM yet — fall back to a short timeout-only
      // wait. The Astro page injects the script inline so this branch is rare.
      window.setTimeout(() => {
        if (window.Stream) onReady();
      }, 100);
    }
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
