import { useState } from "react";
import { PhaseStepper, type PipelineStep } from "./PhaseStepper";
import { normalizeVideoPhase, type VideoPhase } from "../types";

type PrimaryAction =
  | { type: "link"; label: string; href: string }
  | { type: "event"; label: string; eventName: string }
  | { type: "phase"; label: string; phase: VideoPhase; confirmMessage?: string };

interface ProjectPhaseControlsProps {
  videoId: string;
  initialPhase: VideoPhase;
  initialStep?: PipelineStep;
  enabledSteps?: PipelineStep[];
  lockedStepMessages?: Partial<Record<PipelineStep, string>>;
  onPhaseChange?: (phase: VideoPhase) => void;
  primaryAction?: PrimaryAction | null;
}

export function ProjectPhaseControls({
  videoId,
  initialPhase,
  initialStep,
  enabledSteps,
  lockedStepMessages,
  onPhaseChange,
  primaryAction,
}: ProjectPhaseControlsProps) {
  const [currentPhase, setCurrentPhase] = useState(() => normalizeVideoPhase(initialPhase));
  const [currentStep, setCurrentStep] = useState<PipelineStep | undefined>(initialStep);
  const [savingPrimaryAction, setSavingPrimaryAction] = useState(false);

  const handlePhaseChange = (phase: VideoPhase) => {
    setCurrentPhase(phase);
    setCurrentStep(phase);
    onPhaseChange?.(phase);
  };

  const runPrimaryAction = async () => {
    if (!primaryAction || savingPrimaryAction) return;

    if (primaryAction.type === "event") {
      window.dispatchEvent(new CustomEvent(primaryAction.eventName));
      return;
    }

    if (primaryAction.type === "phase") {
      if (primaryAction.confirmMessage && !window.confirm(primaryAction.confirmMessage)) return;
      setSavingPrimaryAction(true);
      try {
        const res = await fetch(`/api/videos/${videoId}/phase`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: primaryAction.phase }),
        });
        if (!res.ok) throw new Error("Failed to update phase");
        handlePhaseChange(primaryAction.phase);
      } catch (err) {
        console.error(err);
      } finally {
        setSavingPrimaryAction(false);
      }
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border-default bg-bg-secondary/70 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 justify-center px-1 py-1">
        <PhaseStepper
          currentPhase={currentPhase}
          currentStep={currentStep}
          enabledSteps={enabledSteps}
          lockedStepMessages={lockedStepMessages}
          videoId={videoId}
        />
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
  );
}
