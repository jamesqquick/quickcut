import { useState, useEffect, useRef } from "react";

export type ReviewStatus = "no_status" | "needs_review" | "in_progress" | "approved";

interface StatusOption {
  value: ReviewStatus;
  label: string;
  // Tailwind text color class for the colored ring
  ringClass: string;
  // Whether the circle is filled (no_status) or hollow (everything else)
  filled: boolean;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "needs_review", label: "Needs Review", ringClass: "text-accent-warning", filled: false },
  { value: "in_progress", label: "In Progress", ringClass: "text-accent-info", filled: false },
  { value: "approved", label: "Approved", ringClass: "text-accent-secondary", filled: false },
  { value: "no_status", label: "No Status", ringClass: "text-text-tertiary", filled: true },
];

function StatusCircle({ option, size = 12 }: { option: StatusOption; size?: number }) {
  if (option.filled) {
    return (
      <span
        className={`inline-block shrink-0 rounded-full bg-current ${option.ringClass}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 border-current ${option.ringClass}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

interface StatusDropdownProps {
  videoId: string;
  initialStatus: ReviewStatus;
}

export function StatusDropdown({ videoId, initialStatus }: StatusDropdownProps) {
  const [status, setStatus] = useState<ReviewStatus>(initialStatus);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[3];

  const selectStatus = async (next: ReviewStatus) => {
    setOpen(false);
    if (next === status) return;

    const previous = status;
    setStatus(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/review-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: next }),
      });
      if (!res.ok) {
        setStatus(previous);
      }
    } catch {
      setStatus(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-bg-secondary disabled:opacity-60"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Review status: ${current.label}`}
      >
        <StatusCircle option={current} />
        <span>{current.label}</span>
        <svg
          className={`h-3 w-3 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Set review status"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border-default bg-bg-secondary py-1 shadow-xl"
        >
          {STATUS_OPTIONS.map((option) => {
            const isActive = option.value === status;
            return (
              <button
                key={option.value}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => selectStatus(option.value)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                <StatusCircle option={option} />
                <span className={`flex-1 ${isActive ? "font-semibold" : ""}`}>{option.label}</span>
                {isActive && (
                  <svg
                    className="h-4 w-4 text-accent-primary"
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
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
