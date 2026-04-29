import { PHASE_LABELS, type VideoPhase } from "../types";
import type { ProjectActivityItem, ProjectActivityType } from "../lib/activity";

interface ProjectActivityTimelineProps {
  activity: ProjectActivityItem[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPhase(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  return PHASE_LABELS[value as VideoPhase] || value;
}

function formatTargetDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "No date";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActivityCopy(item: ProjectActivityItem): { title: string; detail: string } {
  const data = item.data || {};
  const copy: Record<ProjectActivityType, () => { title: string; detail: string }> = {
    "project.created": () => ({
      title: "Created project",
      detail: typeof data.title === "string" ? data.title : "Project created",
    }),
    "phase.changed": () => ({
      title: "Changed phase",
      detail: `${formatPhase(data.from)} -> ${formatPhase(data.to)}`,
    }),
    "target_date.changed": () => ({
      title: "Updated launch date",
      detail: `${formatTargetDate(data.from)} -> ${formatTargetDate(data.to)}`,
    }),
    "first_cut.uploaded": () => ({
      title: "Uploaded first cut",
      detail: typeof data.fileName === "string" ? data.fileName : "Video upload started",
    }),
  };

  return copy[item.type]?.() || { title: item.type, detail: "" };
}

function getActivityIcon(type: ProjectActivityType): string {
  const icons: Record<ProjectActivityType, string> = {
    "project.created": "+",
    "phase.changed": "->",
    "target_date.changed": "cal",
    "first_cut.uploaded": "up",
  };
  return icons[type];
}

export function ProjectActivityTimeline({ activity }: ProjectActivityTimelineProps) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-secondary p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Activity</h2>
          <p className="mt-1 text-sm text-text-secondary">Recent workflow history for this project.</p>
        </div>
      </div>

      {activity.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border-default p-4 text-center text-sm text-text-tertiary">
          No activity recorded yet.
        </div>
      ) : (
        <ol className="mt-5 space-y-4">
          {activity.map((item) => {
            const copy = getActivityCopy(item);
            return (
              <li key={item.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-primary text-[10px] font-semibold text-accent-primary">
                  {getActivityIcon(item.type)}
                </div>
                <div className="min-w-0 flex-1 border-b border-border-default pb-4 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">{copy.title}</p>
                    <time className="text-xs text-text-tertiary">{formatDate(item.createdAt)}</time>
                  </div>
                  {copy.detail && <p className="mt-1 text-sm text-text-secondary">{copy.detail}</p>}
                  <p className="mt-1 text-xs text-text-tertiary">by {item.actorDisplayName}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
