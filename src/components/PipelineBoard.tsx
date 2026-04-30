import { useState } from "react";
import { PHASE_LABELS, VIDEO_PHASES, type VideoPhase } from "../types";
import type { DashboardVideo } from "./dashboard-types";

interface PipelineBoardProps {
  initialVideos: DashboardVideo[];
  spaceId: string;
}

const phaseStyles: Record<VideoPhase, string> = {
  creating_script: "border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
  reviewing_script: "border-accent-info/30 bg-accent-info/10 text-accent-info",
  reviewing_video: "border-accent-warning/30 bg-accent-warning/10 text-accent-warning",
  video_approved: "border-accent-secondary/30 bg-accent-secondary/10 text-accent-secondary",
  published: "border-accent-secondary/30 bg-accent-secondary/10 text-accent-secondary",
};

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getRiskLabel(video: DashboardVideo) {
  if (!video.targetDate || video.phase === "published") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const launch = new Date(`${video.targetDate}T00:00:00`);
  const daysUntil = Math.ceil((launch.getTime() - today.getTime()) / 86_400_000);

  if (daysUntil < 0) return "Overdue";
  if (daysUntil <= 3 && video.phase !== "published") return "At risk";
  return null;
}

export function PipelineBoard({ initialVideos, spaceId }: PipelineBoardProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [movingId, setMovingId] = useState<string | null>(null);

  const moveVideo = async (video: DashboardVideo, phase: VideoPhase) => {
    if (video.phase === phase) return;
    setMovingId(video.id);

    const previous = videos;
    setVideos((current) => current.map((item) => (item.id === video.id ? { ...item, phase } : item)));

    try {
      const res = await fetch(`/api/videos/${video.id}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to move project");
    } catch (err) {
      console.error(err);
      setVideos(previous);
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {VIDEO_PHASES.map((phase) => {
        const columnVideos = videos.filter((video) => video.phase === phase);
        return (
          <section key={phase} className="min-h-[360px] rounded-xl border border-border-default bg-bg-secondary/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{PHASE_LABELS[phase]}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${phaseStyles[phase]}`}>
                {columnVideos.length}
              </span>
            </div>

            {columnVideos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-default p-4 text-center text-sm text-text-tertiary">
                No projects
              </div>
            ) : (
              <div className="space-y-3">
                {columnVideos.map((video) => {
                  const riskLabel = getRiskLabel(video);
                  return (
                    <article key={video.id} className="rounded-lg border border-border-default bg-bg-primary p-3 shadow-sm">
                      <a href={`/videos/${video.id}?space=${spaceId}`} className="block">
                        <div className="flex gap-3">
                          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-bg-tertiary">
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-text-tertiary">
                                {video.status === "draft" ? "Draft" : "Video"}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-text-primary">{video.title}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                              {(video.phase === "creating_script" || video.phase === "reviewing_script") && video.scriptStatus && (
                                <span className="rounded-full bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                                  {video.scriptStatus === "review" ? "In Review" : "Writing"}
                                </span>
                              )}
                              {formatDate(video.targetDate) && <span>Launch {formatDate(video.targetDate)}</span>}
                              {video.commentCount > 0 && <span>{video.commentCount} comments</span>}
                              {video.requiredApprovals > 0 && (
                                <span>{video.approvalCount}/{video.requiredApprovals} approvals</span>
                              )}
                            </div>
                            {riskLabel && (
                              <span className="mt-2 inline-flex rounded-full bg-accent-danger/15 px-2 py-0.5 text-[10px] font-semibold text-accent-danger">
                                {riskLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </a>
                      <label className="mt-3 block text-xs text-text-tertiary">
                        Move to
                        <select
                          value={video.phase}
                          onChange={(event) => moveVideo(video, event.target.value as VideoPhase)}
                          disabled={movingId === video.id}
                          className="mt-1 w-full rounded-md border border-border-default bg-bg-input px-2 py-1.5 text-xs text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
                        >
                          {VIDEO_PHASES.map((option) => (
                            <option key={option} value={option}>{PHASE_LABELS[option]}</option>
                          ))}
                        </select>
                      </label>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
