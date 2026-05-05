import { useEffect, useState } from "react";
import {
  connectVideoRoom,
  type BroadcastApprovalStatus,
} from "../lib/realtime";
import type { ApprovalStatus } from "./ApprovalSection";

interface ApprovalStatusPillProps {
  videoId: string;
  initialStatus: ApprovalStatus | null;
  isPublished: boolean;
  /** Pass null for share viewers (read-only). */
  currentUserId: string | null;
  shareToken?: string;
  viewerName?: string;
}

function CheckIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.29-7.29a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Compact, prominent approval-state pill for the video detail header.
 *
 * Renders one of:
 *  - "Published" (when the project is published)
 *  - "Approved" (threshold met)
 *  - "Awaiting approvals - X/N" (threshold > 0 and not met)
 *  - nothing (no threshold configured / earlier phase without status)
 *
 * Subscribes to the same VideoRoom broadcast channel as ApprovalSection
 * so progress updates in real time.
 */
export function ApprovalStatusPill({
  videoId,
  initialStatus,
  isPublished,
  currentUserId,
  shareToken,
  viewerName,
}: ApprovalStatusPillProps) {
  const [status, setStatus] = useState<ApprovalStatus | null>(initialStatus);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (isPublished) return;
    const conn = connectVideoRoom(
      videoId,
      {
        shareToken,
        viewerName: viewerName || "Anonymous",
        viewerUserId: currentUserId || undefined,
      },
      {
        onApproval: (incoming: BroadcastApprovalStatus) => {
          setStatus(incoming);
        },
      },
    );
    return () => conn.disconnect();
  }, [videoId, shareToken, viewerName, currentUserId, isPublished]);

  if (isPublished) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-accent-secondary/30 bg-accent-secondary/15 px-2.5 py-1 text-xs font-semibold text-accent-secondary"
        aria-label="Project published"
      >
        <CheckIcon />
        Published
      </span>
    );
  }

  if (!status || status.requiredApprovals <= 0) return null;

  if (status.isApproved) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-accent-secondary/30 bg-accent-secondary/15 px-2.5 py-1 text-xs font-semibold text-accent-secondary"
        aria-label="Approved"
      >
        <CheckIcon />
        Approved
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-accent-warning/30 bg-accent-warning/15 px-2.5 py-1 text-xs font-semibold text-accent-warning"
      aria-label={`Awaiting approvals: ${status.currentApprovals} of ${status.requiredApprovals}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent-warning" aria-hidden="true" />
      Awaiting approvals · {status.currentApprovals}/{status.requiredApprovals}
    </span>
  );
}
