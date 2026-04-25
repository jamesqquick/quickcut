import { useState, useEffect, useCallback } from "react";
import { CommentTimeline } from "./CommentTimeline";
import { CommentThread } from "./CommentThread";
import { NamePromptModal } from "./NamePromptModal";
import { VideoPlayer } from "./VideoPlayer";
import { VideoPageLayout } from "./VideoPageLayout";
import { useStreamPlayer } from "../hooks/useStreamPlayer";
import type { Comment } from "../types";

interface Video {
  id: string;
  title: string;
  description: string | null;
  status: string;
  streamVideoId: string | null;
  duration: number | null;
}

interface ShareViewProps {
  video: Video;
  initialComments: Comment[];
  shareToken: string;
}

const ANON_NAME_KEY = "quickcut_anonymous_name";

export function ShareView({ video, initialComments, shareToken }: ShareViewProps) {
  const [anonymousName, setAnonymousName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ANON_NAME_KEY);
  });
  const [liveComments, setLiveComments] = useState(initialComments);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);

  const { iframeRef, currentTime, videoDuration, handleSeek } = useStreamPlayer({
    status: video.status,
    streamVideoId: video.streamVideoId,
    initialDuration: video.duration || 0,
    enabled: !!anonymousName,
  });

  const handleCommentClick = useCallback((commentId: string) => {
    setFocusRequest({ id: commentId, nonce: Date.now() });
  }, []);

  // Track view (only after the user has cleared the name gate).
  useEffect(() => {
    if (!anonymousName) return;
    fetch(`/api/share/${shareToken}/view`, { method: "POST" }).catch(() => {});
  }, [shareToken, anonymousName]);

  const handleNameSubmit = (name: string) => {
    localStorage.setItem(ANON_NAME_KEY, name);
    setAnonymousName(name);
  };

  // Hard gate: no name yet means the page renders nothing but the modal.
  if (!anonymousName) {
    return (
      <NamePromptModal
        isOpen
        onSubmit={handleNameSubmit}
        onClose={() => {}}
        dismissable={false}
        title="Welcome"
        description="Enter your name to view this video and leave comments."
      />
    );
  }

  const leftColumn = (
    <>
      <VideoPlayer
        status={video.status}
        streamVideoId={video.streamVideoId}
        iframeRef={iframeRef}
      />

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
        <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{video.title}</h1>
        {video.description && (
          <p className="mt-2 text-sm text-text-secondary">{video.description}</p>
        )}
      </div>
    </>
  );

  const rightColumn = (
    <CommentThread
      videoId={video.id}
      initialComments={initialComments}
      isAuthenticated={false}
      duration={videoDuration}
      videoStatus={video.status}
      currentTime={currentTime}
      shareToken={shareToken}
      anonymousName={anonymousName}
      liveEnabled
      onSeek={handleSeek}
      onCommentsChange={setLiveComments}
      focusRequest={focusRequest}
    />
  );

  return <VideoPageLayout leftColumn={leftColumn} rightColumn={rightColumn} />;
}
