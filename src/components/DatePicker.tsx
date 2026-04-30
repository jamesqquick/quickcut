import { useEffect, useRef, useState } from "react";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
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

function getInitialMonth(value: string) {
  if (value) return new Date(`${value}T00:00:00`);
  return new Date();
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DatePicker({ value, onChange, disabled = false, placeholder = "Select date", ariaLabel, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => getInitialMonth(value));
  const popoverRef = useRef<HTMLSpanElement>(null);
  const selectedDateKey = value || null;
  const todayKey = toDateKey(new Date());
  const calendarDays = getCalendarDays(month);

  useEffect(() => {
    if (value) setMonth(new Date(`${value}T00:00:00`));
  }, [value]);

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

  return (
    <span ref={popoverRef} className="relative inline-flex w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className ?? "w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:border-border-hover focus:border-accent-primary focus:outline-none disabled:opacity-50"}
      >
        {value ? formatDate(value) : <span className="text-text-tertiary">{placeholder}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-border-default bg-bg-secondary p-3 text-text-secondary shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="Previous month"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M12.707 4.293a1 1 0 010 1.414L8.414 10l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="text-sm font-semibold text-text-primary">
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            <button
              type="button"
              onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="Next month"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.293 15.707a1 1 0 010-1.414L11.586 10 7.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-text-tertiary">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => (
              <div key={weekday} className="py-1">{weekday}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dateKey = toDateKey(day);
              const isSelected = selectedDateKey === dateKey;
              const isToday = todayKey === dateKey;
              const isOutsideMonth = day.getMonth() !== month.getMonth();

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    onChange(dateKey);
                    setOpen(false);
                  }}
                  className={`flex h-8 items-center justify-center rounded-lg text-xs transition-colors ${
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
                onChange("");
                setOpen(false);
              }}
              disabled={!value}
              className="text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-40"
            >
              Clear date
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
