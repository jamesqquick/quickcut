import { useEffect, useState } from "react";
import { actions } from "astro:actions";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, normalizeVideoPhase, type ProjectStatus } from "../types";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { ToastViewport, useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { PublishOverrideDialog } from "./PublishOverrideDialog";
import {
  connectVideoRoom,
  type BroadcastApprovalStatus,
} from "../lib/realtime";
import type { ApprovalStatus } from "./ApprovalSection";

interface ProjectStatusControlsProps {
  videoId: string;
  initialStatus: string;
  canEdit: boolean;
  /** Required to gate publishing on approvals. Pass null when approvals are not configured. */
  initialApprovalStatus?: ApprovalStatus | null;
  /** True when the current user is the space owner — only owners may override. */
  isOwner?: boolean;
  onStatusChange?: (status: ProjectStatus) => void;
}

export function ProjectStatusControls({
  videoId,
  initialStatus,
  canEdit,
  initialApprovalStatus = null,
  isOwner = false,
  onStatusChange,
}: ProjectStatusControlsProps) {
  const [status, setStatus] = useState<ProjectStatus>(() => normalizeVideoPhase(initialStatus));
  const [saving, setSaving] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(initialApprovalStatus);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();
  const isPublished = status === "published";

  // Keep approvalStatus in sync via the realtime broadcast so the gate
  // unlocks (or relocks) the moment any reviewer approves/unapproves.
  useEffect(() => {
    if (!initialApprovalStatus) return;
    const conn = connectVideoRoom(
      videoId,
      { viewerName: "owner" },
      {
        onApproval: (incoming: BroadcastApprovalStatus) => {
          setApprovalStatus(incoming);
        },
      },
    );
    return () => conn.disconnect();
  }, [videoId, initialApprovalStatus]);

  // Same-tab sync from ApprovalSection.
  useEffect(() => {
    if (!initialApprovalStatus) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId: string; status: ApprovalStatus }>).detail;
      if (!detail || detail.videoId !== videoId) return;
      setApprovalStatus(detail.status);
    };
    window.addEventListener("quickcut:approval-update", handler);
    return () => window.removeEventListener("quickcut:approval-update", handler);
  }, [videoId, initialApprovalStatus]);

  const requiresApproval =
    !!approvalStatus && approvalStatus.requiredApprovals > 0;
  const isBlockedFromPublish =
    requiresApproval && !approvalStatus!.isApproved;
  const shortBy = approvalStatus
    ? Math.max(0, approvalStatus.requiredApprovals - approvalStatus.currentApprovals)
    : 0;

  const performStatusUpdate = async (
    nextStatus: ProjectStatus,
    override?: boolean,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await actions.video.setPhase({
        id: videoId,
        phase: nextStatus,
        override,
      });
      if (error) throw new Error(error.message || "Failed to update project status");
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
      showToast(
        override
          ? "Published without full approvals"
          : "Status successfully updated",
      );
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      if (override) {
        setOverrideError(message);
      } else {
        showToast(message, "error");
      }
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (nextStatus: ProjectStatus) => {
    if (nextStatus === status || saving) return;

    if (nextStatus === "published") {
      if (isBlockedFromPublish) {
        if (!isOwner) {
          showToast(
            `Needs ${shortBy} more approval${shortBy === 1 ? "" : "s"} before publishing.`,
            "error",
          );
          return;
        }
        // Owner override path — open confirmation dialog.
        setOverrideError(null);
        setOverrideOpen(true);
        return;
      }
      // Approvals satisfied (or not required) — confirm via overlay before
      // locking the project.
      setPublishConfirmOpen(true);
      return;
    }

    await performStatusUpdate(nextStatus);
  };

  const confirmPublish = async () => {
    const ok = await performStatusUpdate("published");
    if (ok) setPublishConfirmOpen(false);
  };

  const confirmOverride = async () => {
    const ok = await performStatusUpdate("published", true);
    if (ok) setOverrideOpen(false);
  };

  const options: DropdownOption<ProjectStatus>[] = PROJECT_STATUSES.map((option) => ({
    value: option,
    label: PROJECT_STATUS_LABELS[option],
  }));

  // Members without permission to change status see a static label instead
  // of a disabled-but-still-hoverable dropdown.
  if (!canEdit || isPublished) {
    return (
      <div
        className="inline-flex items-center rounded-lg border border-border-default bg-bg-secondary/60 px-3 py-1.5 text-sm font-medium text-text-secondary"
        aria-label={`Project status: ${PROJECT_STATUS_LABELS[status]}`}
      >
        {PROJECT_STATUS_LABELS[status]}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <label htmlFor="project-status" className="sr-only">
        Status
      </label>
      <div className="flex items-center gap-2">
        <Dropdown
          id="project-status"
          options={options}
          value={status}
          onChange={updateStatus}
          disabled={saving}
          menuAlign="left"
        />
      </div>

      {approvalStatus && (
        <PublishOverrideDialog
          isOpen={overrideOpen}
          onCancel={() => {
            if (!saving) setOverrideOpen(false);
          }}
          onConfirm={confirmOverride}
          loading={saving}
          error={overrideError}
          shortBy={shortBy}
          requiredApprovals={approvalStatus.requiredApprovals}
          currentApprovals={approvalStatus.currentApprovals}
        />
      )}

      <ConfirmDialog
        isOpen={publishConfirmOpen}
        title="Mark project as published?"
        description="Publishing locks the project. Script, comments, and video versions become read-only."
        confirmLabel="Mark as published"
        variant="primary"
        loading={saving}
        onConfirm={confirmPublish}
        onCancel={() => {
          if (!saving) setPublishConfirmOpen(false);
        }}
      />
    </div>
  );
}
