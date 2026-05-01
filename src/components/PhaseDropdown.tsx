import { useState, useRef, useEffect } from "react";
import { VIDEO_PHASES, PHASE_LABELS, normalizeVideoPhase, type VideoPhase } from "../types";
import { Dropdown, type DropdownOption } from "./Dropdown";

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
  const [saving, setSaving] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const normalizedPhase = normalizeVideoPhase(currentPhase);
  const enabledPhaseSet = new Set(enabledPhases ?? VIDEO_PHASES);

  // Close publish confirmation on outside click
  useEffect(() => {
    if (!confirmPublish) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setConfirmPublish(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmPublish]);

  const handleSelect = async (phase: VideoPhase) => {
    if (phase === normalizedPhase) return;
    if (!enabledPhaseSet.has(phase)) return;

    if (phase === "published") {
      setConfirmPublish(true);
      return;
    }

    await savePhase(phase);
  };

  const savePhase = async (phase: VideoPhase) => {
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
    }
  };

  if (!canChangePhase) return null;

  const options: DropdownOption<VideoPhase>[] = VIDEO_PHASES.map((phase) => ({
    value: phase,
    label: saving && phase === normalizedPhase ? "Saving..." : PHASE_LABELS[phase],
    disabled: !enabledPhaseSet.has(phase) || phase === normalizedPhase,
    icon:
      phase === normalizedPhase ? (
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.29-7.29a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <span className="inline-block w-3" />
      ),
    iconRight:
      phase === "published" ? (
        <svg
          className="h-3 w-3 text-text-tertiary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ) : undefined,
  }));

  return (
    <div className="relative w-full sm:flex-1 lg:w-44 lg:flex-none">
      <Dropdown
        options={options}
        value={normalizedPhase}
        onChange={handleSelect}
        disabled={saving}
        size="md"
        menuWidth="w-48"
      />

      {confirmPublish && (
        <div
          ref={confirmRef}
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-border-default bg-bg-secondary p-3 shadow-lg"
        >
          <p className="text-xs text-text-secondary">
            Marking this project as published locks the script, comments, and versions. This assumes
            you have published the video manually elsewhere.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => savePhase("published")}
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
      )}
    </div>
  );
}
