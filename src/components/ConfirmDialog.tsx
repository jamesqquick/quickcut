import { useEffect, useId, useRef, useState } from "react";
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
  requireTypedConfirmation?: string;
  typedConfirmationLabel?: string;
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
  requireTypedConfirmation,
  typedConfirmationLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const headingId = useId();
  const inputId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [typedValue, setTypedValue] = useState("");

  // Clear the typed-confirmation input each time the dialog reopens.
  useEffect(() => {
    if (isOpen) setTypedValue("");
  }, [isOpen]);

  // Auto-focus the safer action per variant when the dialog opens. When a
  // typed confirmation is required, focus the input instead so the user can
  // start typing immediately.
  useEffect(() => {
    if (!isOpen) return;
    const target = requireTypedConfirmation
      ? inputRef.current
      : variant === "danger"
        ? cancelRef.current
        : confirmRef.current;
    requestAnimationFrame(() => target?.focus());
  }, [isOpen, variant, requireTypedConfirmation]);

  const typedMatches =
    !requireTypedConfirmation ||
    typedValue.trim() === requireTypedConfirmation;

  const confirmDisabled = loading || !typedMatches;

  const confirmClass =
    variant === "danger"
      ? "flex-1 rounded-lg bg-accent-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-danger/90 disabled:opacity-50"
      : "flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50";

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  const resolvedTypedLabel =
    typedConfirmationLabel ??
    (requireTypedConfirmation
      ? `Type "${requireTypedConfirmation}" to confirm`
      : "");

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
      {requireTypedConfirmation && (
        <div className="mt-4">
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-text-secondary"
          >
            {resolvedTypedLabel}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            disabled={loading}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
          />
        </div>
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
          disabled={confirmDisabled}
          className={confirmClass}
        >
          {loading ? `${confirmLabel}…` : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
