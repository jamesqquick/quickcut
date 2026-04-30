import { useMemo, useState } from "react";
import { PHASE_LABELS, type VideoPhase } from "../types";
import { DatePicker } from "./DatePicker";
import type { DashboardVideo } from "./dashboard-types";

interface CalendarViewProps {
  initialVideos: DashboardVideo[];
  spaceId: string;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const phaseDot: Record<VideoPhase, string> = {
  script: "bg-accent-primary",
  review: "bg-accent-info",
  published: "bg-accent-secondary",
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getRiskLabel(video: DashboardVideo) {
  if (!video.targetDate || video.phase === "published") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const launch = new Date(`${video.targetDate}T00:00:00`);
  const daysUntil = Math.ceil((launch.getTime() - today.getTime()) / 86_400_000);
  if (daysUntil < 0) return "Overdue";
  if (daysUntil <= 3 && (video.phase === "script" || video.phase === "review")) return "At risk";
  return null;
}

export function CalendarView({ initialVideos, spaceId }: CalendarViewProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [month, setMonth] = useState(() => new Date());
  const [savingId, setSavingId] = useState<string | null>(null);

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, DashboardVideo[]>();
    for (const video of videos) {
      if (!video.targetDate) continue;
      const list = map.get(video.targetDate) || [];
      list.push(video);
      map.set(video.targetDate, list);
    }
    return map;
  }, [videos]);

  const unscheduled = videos.filter((video) => !video.targetDate && video.phase !== "published");
  const days = getCalendarDays(month);

  const updateTargetDate = async (video: DashboardVideo, targetDate: string | null) => {
    setSavingId(video.id);
    const previous = videos;
    setVideos((current) => current.map((item) => (item.id === video.id ? { ...item, targetDate } : item)));

    try {
      const res = await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to update launch date");
    } catch (err) {
      console.error(err);
      setVideos(previous);
    } finally {
      setSavingId(null);
    }
  };

  const goToMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-default bg-bg-secondary px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Launch Calendar</h2>
          <p className="text-sm text-text-secondary">Plan spacing across upcoming video launches.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Previous
          </button>
          <div className="min-w-[150px] text-center text-sm font-semibold text-text-primary">{monthLabel(month)}</div>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            className="rounded-lg border border-border-default px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary"
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
        <div className="grid grid-cols-7 border-b border-border-default bg-bg-tertiary/50">
          {weekdayLabels.map((day) => (
            <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-text-tertiary">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-7">
          {days.map((day) => {
            const dateKey = toDateKey(day);
            const dayVideos = scheduledByDate.get(dateKey) || [];
            const outsideMonth = day.getMonth() !== month.getMonth();
            return (
              <div key={dateKey} className={`min-h-[150px] border-b border-r border-border-default p-2 ${outsideMonth ? "bg-bg-primary/40" : "bg-bg-secondary"}`}>
                <div className={`mb-2 text-xs font-medium ${outsideMonth ? "text-text-tertiary" : "text-text-secondary"}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-2">
                  {dayVideos.map((video) => {
                    const riskLabel = getRiskLabel(video);
                    return (
                      <article key={video.id} className="rounded-lg border border-border-default bg-bg-primary p-2">
                        <a href={`/videos/${video.id}?space=${spaceId}`} className="block">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${phaseDot[video.phase]}`} />
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-xs font-semibold text-text-primary">{video.title}</h3>
                              <p className="mt-0.5 text-[10px] text-text-tertiary">{PHASE_LABELS[video.phase]}</p>
                              {riskLabel && (
                                <span className="mt-1 inline-flex rounded-full bg-accent-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-danger">
                                  {riskLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </a>
                        <div className="mt-2 text-[10px] text-text-tertiary">
                          <span>Reschedule</span>
                          <DatePicker
                            value={video.targetDate || ""}
                            onChange={(value) => updateTargetDate(video, value || null)}
                            disabled={savingId === video.id}
                            placeholder="Set date"
                            ariaLabel={`Reschedule ${video.title}`}
                            className="mt-1 w-full rounded border border-border-default bg-bg-input px-1.5 py-1 text-left text-xs text-text-primary transition-colors hover:border-border-hover focus:border-accent-primary focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <section className="rounded-xl border border-border-default bg-bg-secondary p-4">
          <h2 className="text-sm font-semibold text-text-primary">Unscheduled projects</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((video) => (
              <article key={video.id} className="rounded-lg border border-border-default bg-bg-primary p-3">
                <a href={`/videos/${video.id}?space=${spaceId}`} className="text-sm font-semibold text-text-primary hover:text-accent-primary">
                  {video.title}
                </a>
                <p className="mt-1 text-xs text-text-tertiary">{PHASE_LABELS[video.phase]}</p>
                <div className="mt-2 text-xs text-text-tertiary">
                  <span>Set launch date</span>
                  <DatePicker
                    value=""
                    onChange={(value) => updateTargetDate(video, value || null)}
                    disabled={savingId === video.id}
                    placeholder="Set date"
                    ariaLabel={`Set launch date for ${video.title}`}
                    className="mt-1 w-full rounded border border-border-default bg-bg-input px-2 py-1.5 text-left text-xs text-text-primary transition-colors hover:border-border-hover focus:border-accent-primary focus:outline-none disabled:opacity-50"
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
