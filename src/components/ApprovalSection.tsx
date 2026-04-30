import { useCallback, useEffect, useState } from "react";
import { connectVideoRoom, type BroadcastApprovalStatus } from "../lib/realtime";

export interface ApprovalRecord {
  id: string;
  userId: string;
  name: string;
  comment: string | null;
  createdAt: string;
}

export interface ApprovalStatus {
  requiredApprovals: number;
  currentApprovals: number;
  isApproved: boolean;
  approvals: ApprovalRecord[];
}

interface ApprovalSectionProps {
  videoId: string;
  initialStatus: ApprovalStatus;
  /** The currently signed-in user. Pass null for read-only contexts (share view). */
  currentUserId: string | null;
  /** Whether the current user is a member of the video's space. */
  isSpaceMember: boolean;
  /** The id of the user who uploaded the video, if known. */
  uploadedBy: string | null;
  /** When true, never show approve/undo buttons regardless of state. */
  readOnly?: boolean;
  /** Optional viewer info for the realtime connection. */
  viewerName?: string;
  /** Share-link token, if connecting on behalf of an anonymous viewer. */
  shareToken?: string;
  /** Notifies parent UI when approval status changes. */
  onStatusChange?: (status: ApprovalStatus) => void;
}

function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
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
 * Displays the computed approval state for a video. Shows the count
 * relative to the threshold, the list of approving members, and an
 * Approve / Undo Approval button when the viewer is eligible. The
 * uploader sees the status but no button.
 *
 * State stays current via the per-video VideoRoom Durable Object: when
 * any member approves or unapproves, every connected client receives a
 * fresh `ApprovalStatus` snapshot.
 */
export function ApprovalSection({
  videoId,
  initialStatus,
  currentUserId,
  isSpaceMember,
  uploadedBy,
  readOnly = false,
  viewerName,
  shareToken,
  onStatusChange,
}: ApprovalSectionProps) {
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Subscribe to realtime approval updates.
  useEffect(() => {
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
  }, [videoId, shareToken, viewerName, currentUserId]);

  const isUploader =
    !!currentUserId && !!uploadedBy && uploadedBy === currentUserId;
  const hasApproved =
    !!currentUserId && status.approvals.some((a) => a.userId === currentUserId);
  const canApprove =
    !readOnly && !!currentUserId && isSpaceMember && !isUploader && !hasApproved;
  const canUndo =
    !readOnly && !!currentUserId && isSpaceMember && hasApproved;

  const approve = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        approvalStatus?: ApprovalStatus;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Could not approve");
        return;
      }
      if (data.approvalStatus) setStatus(data.approvalStatus);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }, [videoId]);

  const undoApproval = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/approve`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        approvalStatus?: ApprovalStatus;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Could not remove approval");
        return;
      }
      if (data.approvalStatus) setStatus(data.approvalStatus);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }, [videoId]);

  // Don't render at all if the workflow isn't enabled. Defensive check —
  // callers normally gate the section on requiredApprovals > 0.
  if (status.requiredApprovals <= 0) return null;

  return (
    <section
      aria-label="Approval status"
      className="rounded-xl border border-border-default bg-bg-secondary p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Approval status</h2>
            {status.isApproved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-secondary/15 px-2 py-0.5 text-xs font-medium text-accent-secondary">
                <CheckIcon className="h-3.5 w-3.5" />
                Approved
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-accent-warning/15 px-2 py-0.5 text-xs font-medium text-accent-warning">
                Pending
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {status.currentApprovals} of {status.requiredApprovals} approval
            {status.requiredApprovals === 1 ? "" : "s"}
          </p>
        </div>

        {canApprove && (
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            <CheckIcon className="h-4 w-4" />
            Approve
          </button>
        )}
        {canUndo && (
          <button
            type="button"
            onClick={undoApproval}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-bg-secondary disabled:opacity-60"
          >
            Undo Approval
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={`h-full transition-all duration-300 ${
            status.isApproved ? "bg-accent-secondary" : "bg-accent-primary"
          }`}
          style={{
            width: `${Math.min(
              100,
              (status.currentApprovals / Math.max(1, status.requiredApprovals)) * 100,
            )}%`,
          }}
        />
      </div>

      {/* Approver list */}
      {status.approvals.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {status.approvals.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-xs text-text-secondary"
            >
              <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-secondary" />
              <span className="font-medium text-text-primary">
                {a.name}
              </span>
              <span className="text-text-tertiary">approved</span>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-tertiary">{formatTimeAgo(a.createdAt)}</span>
              {a.comment && (
                <span
                  className="ml-1 truncate italic text-text-tertiary"
                  title={a.comment}
                >
                  "{a.comment}"
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Uploader cannot self-approve */}
      {!readOnly && isUploader && (
        <p className="mt-3 text-xs italic text-text-tertiary">
          You cannot approve your own video.
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-accent-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
