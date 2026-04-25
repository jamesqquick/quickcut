import { useEffect, useId, useRef } from "react";
import { Modal } from "./Modal";

type ConfirmVariant = "danger" | "primary";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the safer action per variant when the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    const target = variant === "danger" ? cancelRef.current : confirmRef.current;
    // Defer to ensure the element is mounted and visible.
    requestAnimationFrame(() => target?.focus());
  }, [isOpen, variant]);

  const confirmClass =
    variant === "danger"
      ? "flex-1 rounded-lg bg-accent-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-danger/90 disabled:opacity-50"
      : "flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50";

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      closeOnBackdropClick={!loading}
      closeOnEscape={!loading}
      showCloseButton={!loading}
      ariaLabelledBy={headingId}
      size="sm"
    >
      <h2 id={headingId} className="text-lg font-semibold text-text-primary">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      )}
      <div className="mt-5 flex gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={confirmClass}
        >
          {loading ? `${confirmLabel}…` : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
