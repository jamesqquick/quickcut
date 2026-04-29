import { useState, useRef, useEffect } from "react";
import { VIDEO_PHASES, PHASE_LABELS, normalizeVideoPhase, type VideoPhase } from "../types";

interface PhaseDropdownProps {
  videoId: string;
  currentPhase: VideoPhase;
  canChangePhase: boolean;
  enabledPhases?: VideoPhase[];
  onPhaseChange: (newPhase: VideoPhase) => void;
}

export function PhaseDropdown({
  videoId,
  currentPhase,
  canChangePhase,
  enabledPhases,
  onPhaseChange,
}: PhaseDropdownProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const normalizedPhase = normalizeVideoPhase(currentPhase);
  const enabledPhaseSet = new Set(enabledPhases ?? VIDEO_PHASES);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmPublish(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleSelect = async (phase: VideoPhase) => {
    if (phase === normalizedPhase) {
      setOpen(false);
      return;
    }
    if (!enabledPhaseSet.has(phase)) return;

    // Confirm before publishing
    if (phase === "published" && !confirmPublish) {
      setConfirmPublish(true);
      return;
    }

    setSaving(true);
    setConfirmPublish(false);

    try {
      const res = await fetch(`/api/videos/${videoId}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update phase");
      onPhaseChange(phase);
    } catch (err) {
      console.error("Phase update failed:", err);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  if (!canChangePhase) return null;

  return (
    <div ref={dropdownRef} className="relative w-full sm:flex-1 lg:w-44 lg:flex-none">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setConfirmPublish(false);
        }}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50"
      >
        {saving ? "Saving..." : PHASE_LABELS[normalizedPhase]}
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border-default bg-bg-secondary shadow-lg">
          {confirmPublish ? (
            <div className="p-3">
              <p className="text-xs text-text-secondary">
                Publishing locks the video. Comments and versions become read-only.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelect("published")}
                  className="rounded-md bg-accent-secondary px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-secondary/90"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPublish(false)}
                  className="rounded-md px-2.5 py-1 text-xs text-text-tertiary hover:text-text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ul className="py-1">
              {VIDEO_PHASES.map((phase) => {
                const isEnabled = enabledPhaseSet.has(phase);
                return <li key={phase}>
                  <button
                    type="button"
                    onClick={() => handleSelect(phase)}
                    disabled={phase === normalizedPhase || !isEnabled}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      phase === normalizedPhase
                        ? "text-accent-primary font-medium cursor-default"
                        : !isEnabled
                          ? "cursor-not-allowed text-text-tertiary opacity-50"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                    }`}
                  >
                    {phase === normalizedPhase && (
                      <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.29-7.29a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    <span className={phase !== normalizedPhase ? "ml-5" : ""}>
                      {PHASE_LABELS[phase]}
                    </span>
                    {phase === "published" && (
                      <svg className="ml-auto h-3 w-3 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    )}
                  </button>
                </li>;
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
