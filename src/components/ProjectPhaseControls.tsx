import { useId, useState } from "react";
import { FullscreenOverlay } from "./FullscreenOverlay";
import { PhaseStepper, type PipelineStep } from "./PhaseStepper";
import { normalizeVideoPhase, type VideoPhase } from "../types";

type PrimaryAction =
  | { type: "link"; label: string; href: string }
  | { type: "event"; label: string; eventName: string }
  | { type: "phase"; label: string; phase: VideoPhase; confirmMessage?: string };

interface ProjectPhaseControlsProps {
  videoId: string;
  initialPhase: VideoPhase;
  currentStep?: PipelineStep;
  enabledSteps?: PipelineStep[];
  lockedStepMessages?: Partial<Record<PipelineStep, string>>;
  onPhaseChange?: (phase: VideoPhase) => void;
  primaryAction?: PrimaryAction | null;
}

export function ProjectPhaseControls({
  videoId,
  initialPhase,
  currentStep,
  enabledSteps,
  lockedStepMessages,
  onPhaseChange,
  primaryAction,
}: ProjectPhaseControlsProps) {
  const confirmHeadingId = useId();
  const [currentPhase, setCurrentPhase] = useState(() => normalizeVideoPhase(initialPhase));
  const [savingPrimaryAction, setSavingPrimaryAction] = useState(false);
  const [confirmPhaseOpen, setConfirmPhaseOpen] = useState(false);
  const [phaseError, setPhaseError] = useState("");

  const handlePhaseChange = (phase: VideoPhase) => {
    setCurrentPhase(phase);
    onPhaseChange?.(phase);
  };

  const runPhaseAction = async (action: Extract<PrimaryAction, { type: "phase" }>) => {
    setSavingPrimaryAction(true);
    setPhaseError("");
    try {
      const res = await fetch(`/api/videos/${videoId}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: action.phase }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to update phase");
      handlePhaseChange(action.phase);
      setConfirmPhaseOpen(false);
    } catch (err) {
      setPhaseError(err instanceof Error ? err.message : "Failed to update phase");
      console.error(err);
    } finally {
      setSavingPrimaryAction(false);
    }
  };

  const runPrimaryAction = () => {
    if (!primaryAction || savingPrimaryAction) return;

    if (primaryAction.type === "event") {
      window.dispatchEvent(new CustomEvent(primaryAction.eventName));
      return;
    }

    if (primaryAction.type === "phase") {
      if (primaryAction.confirmMessage) {
        setPhaseError("");
        setConfirmPhaseOpen(true);
        return;
      }
      void runPhaseAction(primaryAction);
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-4 rounded-xl border border-border-default bg-bg-secondary/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          {currentPhase === "published" && (
            <div className="flex justify-center lg:justify-start">
              <span className="rounded-full border border-accent-secondary/30 bg-accent-secondary/10 px-2.5 py-1 text-xs font-semibold text-accent-secondary">
                Published
              </span>
            </div>
          )}
          <div className="flex min-w-0 justify-center px-1 py-1 lg:justify-start">
            <PhaseStepper
              currentPhase={currentPhase}
              currentStep={currentStep}
              enabledSteps={enabledSteps}
              lockedStepMessages={lockedStepMessages}
              videoId={videoId}
            />
          </div>
        </div>
        {primaryAction && (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
            {primaryAction.type === "link" && (
              <a
                href={primaryAction.href}
                className="inline-flex w-full justify-center rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:flex-1 lg:w-44 lg:flex-none"
              >
                {primaryAction.label}
              </a>
            )}
            {primaryAction.type !== "link" && (
              <button
                type="button"
                onClick={runPrimaryAction}
                disabled={savingPrimaryAction}
                className="inline-flex w-full justify-center rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 sm:flex-1 lg:w-44 lg:flex-none"
              >
                {savingPrimaryAction ? "Saving..." : primaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      {primaryAction?.type === "phase" && primaryAction.confirmMessage && (
        <FullscreenOverlay
          isOpen={confirmPhaseOpen}
          onClose={() => {
            if (!savingPrimaryAction) setConfirmPhaseOpen(false);
          }}
          closeOnBackdropClick={!savingPrimaryAction}
          closeOnEscape={!savingPrimaryAction}
          ariaLabelledBy={confirmHeadingId}
          contentClassName="m-4 w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-6 shadow-2xl"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runPhaseAction(primaryAction);
            }}
          >
            <h2 id={confirmHeadingId} className="text-lg font-semibold text-text-primary">
              Mark project as published?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{primaryAction.confirmMessage}</p>
            {phaseError && (
              <div className="mt-4 rounded-lg bg-accent-danger/15 px-3 py-2 text-sm text-accent-danger">
                {phaseError}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmPhaseOpen(false)}
                disabled={savingPrimaryAction}
                className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPrimaryAction}
                className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {savingPrimaryAction ? "Marking..." : "Mark as Published"}
              </button>
            </div>
          </form>
        </FullscreenOverlay>
      )}
    </>
  );
}
