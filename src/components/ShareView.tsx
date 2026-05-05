import { useEffect, useState } from "react";
import { NamePromptModal } from "./NamePromptModal";
import { ScriptWorkspace } from "./ScriptWorkspace";
import { VideoDetailsPanel } from "./VideoDetailsPanel";
import { VideoDetailView } from "./VideoDetailView";
import type { ApprovalStatus } from "./ApprovalSection";
import type { TranscriptResponse } from "./TranscriptPanel";
import type { Comment } from "../types";
import type { ProjectActivityItem } from "../lib/activity";

interface Video {
  id: string;
  spaceId: string;
  title: string;
  status: string;
  streamVideoId: string | null;
  duration: number | null;
  fileName: string | null;
  targetDate: string | null;
  uploadedBy: string | null;
  createdAt: string;
  phase: string;
  description: string | null;
  targetAudience: string | null;
  hook: string | null;
  takeaway1: string | null;
  takeaway2: string | null;
  takeaway3: string | null;
  primaryCta: string | null;
  outro: string | null;
}

interface ShareViewProps {
  activeTab: "details" | "script" | "video";
  video: Video;
  initialScriptContent: string;
  initialComments: Comment[];
  shareToken: string;
  initialApprovalStatus: ApprovalStatus | null;
  initialActivity: ProjectActivityItem[];
  pipelineEnabled: boolean;
  initialTranscriptData: TranscriptResponse | null;
}

const ANON_NAME_KEY = "quickcut_anonymous_name";

export function ShareView({
  activeTab,
  video,
  initialScriptContent,
  initialComments,
  shareToken,
  initialApprovalStatus,
  initialActivity,
  pipelineEnabled,
  initialTranscriptData,
}: ShareViewProps) {
  const [anonymousName, setAnonymousName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ANON_NAME_KEY);
  });

  useEffect(() => {
    if (!anonymousName) return;
    fetch(`/api/share/${shareToken}/view`, { method: "POST" }).catch(() => {});
  }, [shareToken, anonymousName]);

  const handleNameSubmit = (name: string) => {
    localStorage.setItem(ANON_NAME_KEY, name);
    setAnonymousName(name);
  };

  if (!anonymousName) {
    return (
      <NamePromptModal
        isOpen
        onSubmit={handleNameSubmit}
        onClose={() => {}}
        dismissable={false}
        title="Welcome"
        description="Enter your name to view this project and leave comments."
      />
    );
  }

  if (activeTab === "details") {
    return (
      <VideoDetailsPanel
        videoId={video.id}
        isOwner={false}
        description={video.description}
        targetAudience={video.targetAudience}
        hook={video.hook}
        takeaway1={video.takeaway1}
        takeaway2={video.takeaway2}
        takeaway3={video.takeaway3}
        primaryCta={video.primaryCta}
        outro={video.outro}
      />
    );
  }

  if (activeTab === "script") {
    return (
      <ScriptWorkspace
        videoId={video.id}
        spaceId={video.spaceId}
        initialContent={initialScriptContent}
        initialComments={initialComments}
        currentUserName={anonymousName}
        readOnly={video.phase === "published"}
        shareToken={shareToken}
        anonymousName={anonymousName}
      />
    );
  }

  return (
    <VideoDetailView
      videoId={video.id}
      spaceId={video.spaceId}
      streamVideoId={video.streamVideoId}
      status={video.status}
      duration={video.duration}
      initialComments={initialComments}
      currentUserId=""
      currentUserName={anonymousName}
      title={video.title}
      uploadDate={video.createdAt}
      fileName={video.fileName}
      targetDate={video.targetDate}
      transcriptsEnabled={false}
      uploadedBy={video.uploadedBy}
      initialApprovalStatus={initialApprovalStatus}
      initialPhase={video.phase}
      pipelineEnabled={pipelineEnabled}
      userRole="guest"
      shareToken={shareToken}
      initialActivity={initialActivity}
      initialTranscriptData={initialTranscriptData}
    />
  );
}
