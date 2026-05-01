import { useEffect, useState } from "react";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, normalizeVideoPhase, type ProjectStatus } from "../types";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { ToastViewport, useToast } from "./Toast";

interface ProjectStatusControlsProps {
  videoId: string;
  initialStatus: string;
  canEdit: boolean;
  onStatusChange?: (status: ProjectStatus) => void;
}

export function ProjectStatusControls({
  videoId,
  initialStatus,
  canEdit,
  onStatusChange,
}: ProjectStatusControlsProps) {
  const [status, setStatus] = useState<ProjectStatus>(() => normalizeVideoPhase(initialStatus));
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();
  const isPublished = status === "published";

  useEffect(() => {
    const message = window.sessionStorage.getItem("quickcut:status-toast");
    if (!message) return;

    window.sessionStorage.removeItem("quickcut:status-toast");
    showToast(message);
  }, [showToast]);

  const updateStatus = async (nextStatus: ProjectStatus) => {
    if (nextStatus === status || saving) return;
    if (nextStatus === "published" && !window.confirm("Publishing locks the project. Script, comments, and video versions become read-only.")) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: nextStatus }),
      });
      if (!res.ok) throw new Error("Failed to update project status");
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
      window.sessionStorage.setItem("quickcut:status-toast", "Status successfully updated");
      window.location.reload();
    } catch (err) {
      console.error(err);
      showToast("Failed to update status", "error");
    } finally {
      setSaving(false);
    }
  };

  const options: DropdownOption<ProjectStatus>[] = PROJECT_STATUSES.map((option) => ({
    value: option,
    label: PROJECT_STATUS_LABELS[option],
  }));

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
          disabled={!canEdit || saving || isPublished}
          menuAlign="left"
        />
      </div>
    </div>
  );
}
