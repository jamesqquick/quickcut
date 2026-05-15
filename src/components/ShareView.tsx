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
  versionNotes: string | null;
}

interface ShareViewCurrentUser {
  id: string;
  name: string;
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
  currentUser: ShareViewCurrentUser | null;
  initialGuestName?: string | null;
}

const ANON_NAME_KEY = "quickcut_anonymous_name";
const GUEST_NAME_COOKIE = "qc_guest_name";
const GUEST_NAME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const GUEST_NAME_MAX_LENGTH = 100;

function writeGuestNameCookie(name: string) {
  if (typeof document === "undefined") return;
  const trimmed = name.slice(0, GUEST_NAME_MAX_LENGTH);
  const encoded = encodeURIComponent(trimmed);
  const isHttps = typeof location !== "undefined" && location.protocol === "https:";
  const secure = isHttps ? "; Secure" : "";
  document.cookie = `${GUEST_NAME_COOKIE}=${encoded}; Max-Age=${GUEST_NAME_COOKIE_MAX_AGE}; Path=/s/; SameSite=Lax${secure}`;
}

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
  currentUser,
  initialGuestName,
}: ShareViewProps) {
  const [anonymousName, setAnonymousName] = useState<string | null>(() => {
    if (currentUser) return null;
    if (initialGuestName) return initialGuestName;
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ANON_NAME_KEY);
  });

  const viewerName = currentUser?.name ?? anonymousName;
  const viewerId = currentUser?.id ?? "";

  // Backfill the cookie for guests who set their name before this fix shipped
  // (localStorage present, cookie absent). Without this, the next SSR render
  // would still show the modal and produce a hydration-mismatch flash.
  useEffect(() => {
    if (currentUser) return;
    if (initialGuestName) return;
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(ANON_NAME_KEY);
    if (stored) writeGuestNameCookie(stored);
  }, [currentUser, initialGuestName]);

  useEffect(() => {
    if (!viewerName) return;
    fetch(`/api/share/${shareToken}/view`, { method: "POST" }).catch(() => {});
  }, [shareToken, viewerName]);

  const handleNameSubmit = (name: string) => {
    const capped = name.slice(0, GUEST_NAME_MAX_LENGTH);
    localStorage.setItem(ANON_NAME_KEY, capped);
    writeGuestNameCookie(capped);
    setAnonymousName(capped);
  };

  if (!currentUser && !anonymousName) {
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
        targetDate={video.targetDate}
        canSetTargetDate={false}
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
        currentUserName={viewerName}
        readOnly={video.phase === "published"}
        shareToken={shareToken}
        anonymousName={viewerName}
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
      currentUserId={viewerId}
      currentUserName={viewerName}
      title={video.title}
      uploadDate={video.createdAt}
      fileName={video.fileName}
      transcriptsEnabled={false}
      uploadedBy={video.uploadedBy}
      initialApprovalStatus={initialApprovalStatus}
      initialPhase={video.phase}
      pipelineEnabled={pipelineEnabled}
      userRole="guest"
      shareToken={shareToken}
      initialActivity={initialActivity}
      initialTranscriptData={initialTranscriptData}
      hook={video.hook}
      takeaway1={video.takeaway1}
      takeaway2={video.takeaway2}
      takeaway3={video.takeaway3}
      versionNotes={video.versionNotes}
    />
  );
}
