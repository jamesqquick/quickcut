import { normalizeVideoPhase, type VideoPhase } from "../types";

export type PipelineStep = "script" | "review" | "published";

const PIPELINE_STEPS: Array<{ key: PipelineStep; label: string }> = [
  { key: "script", label: "Script" },
  { key: "review", label: "Video" },
  { key: "published", label: "Published" },
];

interface PhaseStepperProps {
  currentPhase: VideoPhase;
  enabledSteps?: PipelineStep[];
  lockedStepMessages?: Partial<Record<PipelineStep, string>>;
  videoId?: string;
}

function getStepHref(videoId: string, step: PipelineStep) {
  if (step === "script") return `/videos/${videoId}/script`;
  if (step === "published") return `/videos/${videoId}`;
  return `/videos/${videoId}/review`;
}

function getStepForPhase(phase: VideoPhase): PipelineStep {
  const normalizedPhase = normalizeVideoPhase(phase);
  if (normalizedPhase === "script") return "script";
  return normalizedPhase;
}

export function PhaseStepper({ currentPhase, enabledSteps, lockedStepMessages, videoId }: PhaseStepperProps) {
  const visibleSteps = PIPELINE_STEPS;
  const statusStep = getStepForPhase(currentPhase);
  const statusIdx = visibleSteps.findIndex((step) => step.key === statusStep);
  const enabledStepSet = new Set(enabledSteps ?? visibleSteps.map((step) => step.key));

  return (
    <div className="flex min-w-max items-center gap-1">
      {visibleSteps.map(({ key, label }, idx) => {
        const isComplete = idx < statusIdx;
        const isStatus = idx === statusIdx;
        const isPublished = key === "published" && isStatus;
        const isEnabled = enabledStepSet.has(key);
        const stepHref = videoId && isEnabled ? getStepHref(videoId, key) : undefined;
        const StepElement = stepHref ? "a" : "span";
        const lockedMessage = lockedStepMessages?.[key];

        return (
          <div key={key} className="flex items-center">
            {idx > 0 && (
              <div
                className={`mx-1 h-px w-3 sm:w-5 lg:w-6 ${
                  idx <= statusIdx ? "bg-accent-primary" : "bg-border-default"
                }`}
              />
            )}
            <StepElement
              href={stepHref}
              aria-current={isStatus ? "step" : undefined}
              aria-disabled={!isEnabled ? "true" : undefined}
              title={!isEnabled ? "Complete the previous step first" : undefined}
              className={`group relative flex items-center gap-1.5 rounded-lg px-1 py-1 transition-colors ${stepHref ? "hover:bg-bg-tertiary" : "cursor-not-allowed opacity-50"}`}
            >
              {/* Step indicator */}
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  isPublished
                    ? "bg-accent-secondary text-white"
                    : isStatus
                      ? "bg-accent-primary text-white"
                      : isComplete
                        ? "bg-accent-primary/20 text-accent-primary"
                        : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {isComplete ? (
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.296a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.29-7.29a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : isPublished ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              {/* Label */}
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isStatus ? "text-text-primary" : isComplete ? "text-text-secondary" : "text-text-tertiary"
                }`}
              >
                {label}
              </span>
              {lockedMessage && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition-colors group-hover:bg-bg-tertiary group-hover:text-text-secondary group-focus:bg-bg-tertiary group-focus:text-text-secondary">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-left text-xs font-normal text-text-secondary shadow-lg group-hover:block group-focus:block">
                    {lockedMessage}
                  </span>
                </span>
              )}
            </StepElement>
          </div>
        );
      })}
    </div>
  );
}
