import { useEffect, useRef, useState } from "react";
import { ToastViewport, useToast } from "./Toast";

interface TargetDateEditorProps {
  videoId: string;
  initialTargetDate: string | null;
  canEdit: boolean;
  variant?: "default" | "metadata";
}

function formatTargetDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getMonthLabel(month: Date) {
  return month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getInitialCalendarMonth(date: string) {
  if (date) return new Date(`${date}T00:00:00`);
  return new Date();
}

export function TargetDateEditor({ videoId, initialTargetDate, canEdit, variant = "default" }: TargetDateEditorProps) {
  const [targetDate, setTargetDate] = useState(initialTargetDate || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getInitialCalendarMonth(initialTargetDate || ""));
  const { toasts, showToast, dismissToast } = useToast();

  const saveTargetDate = async (nextDate: string) => {
    setTargetDate(nextDate);
    if (nextDate) setCalendarMonth(new Date(`${nextDate}T00:00:00`));
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: nextDate || null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to update target date");
      showToast(nextDate ? "Launch date saved" : "Launch date cleared");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update target date";
      setError(message);
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!canEdit && !targetDate) return null;

  if (variant === "metadata") {
    const selectedDateKey = targetDate || null;
    const todayKey = toDateKey(new Date());
    const calendarDays = getCalendarDays(calendarMonth);

    return (
      <>
      <span className="inline-flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {canEdit ? (
          <span ref={popoverRef} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="rounded-md px-1.5 py-0.5 text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-accent-primary focus:bg-bg-tertiary focus:text-accent-primary focus:outline-none"
            >
              {targetDate ? `Launch ${formatTargetDate(targetDate)}` : "Set launch date"}
            </button>
            {open && (
              <div
                role="dialog"
                aria-label="Choose launch date"
                className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border-default bg-bg-secondary p-3 text-text-secondary shadow-xl"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                    aria-label="Previous month"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 4.293a1 1 0 010 1.414L8.414 10l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="text-sm font-semibold text-text-primary">{getMonthLabel(calendarMonth)}</div>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                    aria-label="Next month"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 15.707a1 1 0 010-1.414L11.586 10 7.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-text-tertiary">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((weekday) => (
                    <div key={weekday} className="py-1">{weekday}</div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const dateKey = toDateKey(day);
                    const isSelected = selectedDateKey === dateKey;
                    const isToday = todayKey === dateKey;
                    const isOutsideMonth = day.getMonth() !== calendarMonth.getMonth();

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => {
                          void saveTargetDate(dateKey);
                          setOpen(false);
                        }}
                        disabled={saving}
                        className={`flex h-8 items-center justify-center rounded-lg text-xs transition-colors disabled:opacity-50 ${
                          isSelected
                            ? "bg-accent-primary text-white"
                            : isToday
                              ? "border border-accent-primary/50 text-text-primary hover:bg-bg-tertiary"
                              : isOutsideMonth
                                ? "text-text-tertiary/50 hover:bg-bg-tertiary hover:text-text-secondary"
                                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border-default pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      void saveTargetDate("");
                      setOpen(false);
                    }}
                    disabled={saving || !targetDate}
                    className="text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-40"
                  >
                    Clear date
                  </button>
                </div>
              </div>
            )}
          </span>
        ) : (
          <span>Launch {formatTargetDate(targetDate)}</span>
        )}
      </span>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {canEdit ? (
          <label className="inline-flex items-center gap-1.5">
            <span>Launch</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => saveTargetDate(event.target.value)}
              disabled={saving}
              aria-label="Target launch date"
              className="rounded border border-border-default bg-bg-input px-2 py-1 text-xs text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            />
          </label>
        ) : (
          <span>Launch {formatTargetDate(targetDate)}</span>
        )}
        {saving && <span className="text-text-tertiary">Saving...</span>}
        {error && <span className="text-accent-danger">{error}</span>}
      </span>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
