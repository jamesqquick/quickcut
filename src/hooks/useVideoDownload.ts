import { useEffect, useRef, useState } from "react";
import { friendlyActionErrorMessage } from "../lib/errors";
import type { VideoDownloadResponse } from "../types";

interface VideoDownloadOptions {
  videoId: string;
  shareToken?: string;
  onDownloaded: () => void;
  onError: (message: string) => void;
}

export function useVideoDownload({ videoId, shareToken, onDownloaded, onError }: VideoDownloadOptions) {
  const [preparingDownload, setPreparingDownload] = useState(false);
  const downloadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => downloadAbortRef.current?.abort(), []);

  const downloadVideo = async () => {
    if (preparingDownload) return;
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setPreparingDownload(true);
    const fallback = "We couldn't download the video. Please try again.";
    const endpoint = shareToken
      ? `/api/share/${shareToken}/download`
      : `/api/videos/${videoId}/download`;

    try {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (controller.signal.aborted) return;
        const response = await fetch(endpoint, {
          method: attempt === 0 ? "POST" : "GET",
          signal: controller.signal,
        });
        const data = await response.json() as VideoDownloadResponse & { error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) {
          onError(friendlyActionErrorMessage(data.error, fallback));
          return;
        }
        if (data.status === "ready" && data.url) {
          const link = document.createElement("a");
          link.href = data.url;
          link.download = "";
          document.body.appendChild(link);
          link.click();
          link.remove();
          onDownloaded();
          return;
        }
        if (data.status !== "inprogress") {
          onError(fallback);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!controller.signal.aborted) {
        onError("The MP4 is still being prepared. Try Download again shortly.");
      }
    } catch {
      if (!controller.signal.aborted) onError(fallback);
    } finally {
      if (!controller.signal.aborted) setPreparingDownload(false);
    }
  };

  return { preparingDownload, downloadVideo };
}
