import { useState } from "react";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, normalizeVideoPhase, type ProjectStatus } from "../types";
import { Dropdown, type DropdownOption } from "./Dropdown";

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
  const isPublished = status === "published";

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
      window.location.reload();
    } catch (err) {
      console.error(err);
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
        {saving && <span className="text-xs text-text-tertiary">Saving...</span>}
      </div>
    </div>
  );
}
