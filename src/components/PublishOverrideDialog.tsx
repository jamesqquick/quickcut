import { useId } from "react";
import { FullscreenOverlay } from "./FullscreenOverlay";

interface PublishOverrideDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
  /** How many approvals short of the threshold the project is. */
  shortBy: number;
  /** Total required approvals (for context in the dialog body). */
  requiredApprovals: number;
  /** Current approval count (for context). */
  currentApprovals: number;
}

/**
 * Owner-only override confirmation. Shown when an owner attempts to
 * publish a video that has not met its required-approvals threshold.
 * The override is logged in the project activity timeline.
 */
export function PublishOverrideDialog({
  isOpen,
  onCancel,
  onConfirm,
  loading = false,
  error,
  shortBy,
  requiredApprovals,
  currentApprovals,
}: PublishOverrideDialogProps) {
  const headingId = useId();

  return (
    <FullscreenOverlay
      isOpen={isOpen}
      onClose={() => {
        if (!loading) onCancel();
      }}
      closeOnBackdropClick={!loading}
      closeOnEscape={!loading}
      ariaLabelledBy={headingId}
      contentClassName="m-4 w-full max-w-md rounded-2xl border border-border-default bg-bg-secondary p-6 shadow-2xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading) onConfirm();
        }}
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          Publish without full approvals?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          This project has {currentApprovals} of {requiredApprovals} required
          approval{requiredApprovals === 1 ? "" : "s"}. As space owner, you can
          publish anyway — but the override will be recorded in the project
          activity timeline.
        </p>
        <div className="mt-3 rounded-lg border border-accent-warning/30 bg-accent-warning/10 px-3 py-2 text-xs text-accent-warning">
          Publishing will skip {shortBy} pending approval
          {shortBy === 1 ? "" : "s"}.
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-accent-danger/15 px-3 py-2 text-sm text-accent-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-accent-warning px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Publishing..." : "Publish anyway"}
          </button>
        </div>
      </form>
    </FullscreenOverlay>
  );
}
