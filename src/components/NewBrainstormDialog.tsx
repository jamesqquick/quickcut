import { useEffect, useId, useState } from "react";
import { actions } from "astro:actions";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { friendlyActionErrorMessage } from "../lib/errors";

interface NewBrainstormDialogProps {
  isOpen: boolean;
  spaceId: string;
  initialTitle?: string;
  initialNotes?: string;
  editingId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function NewBrainstormDialog({
  isOpen,
  spaceId,
  initialTitle = "",
  initialNotes = "",
  editingId,
  onClose,
  onSaved,
}: NewBrainstormDialogProps) {
  const headingId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setNotes(initialNotes);
    setError("");
  }, [isOpen, initialTitle, initialNotes]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError("");

    try {
      if (editingId) {
        const { error: actionError } = await actions.brainstorm.update({
          id: editingId,
          title: title.trim(),
          notes: notes.trim(),
        });
        if (actionError) throw new Error(actionError.message || "");
      } else {
        const { error: actionError } = await actions.brainstorm.create({
          spaceId,
          title: title.trim(),
          notes: notes.trim(),
        });
        if (actionError) throw new Error(actionError.message || "");
      }
      onSaved();
      setSaving(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          editingId
            ? "We couldn't save your changes. Please try again."
            : "We couldn't save the idea. Please try again.",
        ),
      );
      setSaving(false);
    }
  };

  const isEditing = Boolean(editingId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      closeOnBackdropClick={!saving}
      closeOnEscape={!saving}
      showCloseButton={!saving}
      ariaLabelledBy={headingId}
      size="md"
    >
      <h2 id={headingId} className="text-lg font-semibold text-text-primary">
        {isEditing ? "Edit idea" : "Capture an idea"}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Capture something your team should make a video about. You can promote it to a project anytime.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="brainstorm-title">
            Title
          </label>
          <input
            id="brainstorm-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            autoFocus
            maxLength={200}
            className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            placeholder="Workers vs Lambda showdown"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="brainstorm-notes">
            Notes <span className="text-text-tertiary">(optional)</span>
          </label>
          <textarea
            id="brainstorm-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={saving}
            rows={6}
            maxLength={5000}
            className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            placeholder="Why this matters, the angle, who it's for..."
          />
          <p className="mt-1 text-right text-xs text-text-tertiary">
            {notes.length} / 5000
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={close}
            disabled={saving}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !title.trim()}
            className="flex-1"
          >
            {saving ? "Saving..." : isEditing ? "Save" : "Add idea"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
