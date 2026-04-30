import { useState } from "react";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, normalizeVideoPhase, type ProjectStatus } from "../types";

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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-bg-secondary/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Project status</p>
        <p className="mt-1 text-sm text-text-secondary">
          Status is a lightweight label. Only Published makes the project read-only.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={status}
          onChange={(event) => updateStatus(event.target.value as ProjectStatus)}
          disabled={!canEdit || saving || isPublished}
          className="rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
        >
          {PROJECT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {PROJECT_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        {!isPublished && canEdit && (
          <button
            type="button"
            onClick={() => updateStatus("published")}
            disabled={saving}
            className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Mark Published"}
          </button>
        )}
      </div>
    </div>
  );
}
