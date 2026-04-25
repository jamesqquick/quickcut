import { useState } from "react";

interface NamePromptModalProps {
  isOpen: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
  /**
   * When false, the modal cannot be dismissed: no Cancel button is shown and
   * the submit button takes the full width. Used as a hard page-load gate
   * for anonymous reviewers.
   */
  dismissable?: boolean;
  title?: string;
  description?: string;
}

export function NamePromptModal({
  isOpen,
  onSubmit,
  onClose,
  dismissable = true,
  title = "What's your name?",
  description = "Enter your name to leave comments on this video.",
}: NamePromptModalProps) {
  const [name, setName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border-default bg-bg-secondary p-6">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last name"
            autoFocus
            className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          />
          <div className="flex gap-3">
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!name.trim()}
              className={`${dismissable ? "flex-1" : "w-full"} rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50`}
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
