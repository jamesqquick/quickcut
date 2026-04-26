import type { ReactNode, RefObject } from "react";

interface VideoPlayerProps {
  status: string;
  streamVideoId: string | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Annotation overlay rendered on top of the video. */
  overlay?: ReactNode;
}

export function VideoPlayer({ status, streamVideoId, iframeRef, overlay }: VideoPlayerProps) {
  if (status === "processing") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-accent-warning/30" />
          <p className="text-lg font-semibold text-text-primary">
            This video is being processed...
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            This usually takes a few minutes
          </p>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
        <div className="text-center">
          <p className="text-lg font-semibold text-accent-danger">Processing failed</p>
          <p className="mt-1 text-sm text-text-secondary">
            There was an error processing this video
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
      {overlay}
    </div>
  );
}
