import { useId, useState } from "react";
import { actions } from "astro:actions";
import { Modal } from "./Modal";
import { friendlyActionErrorMessage } from "../lib/errors";

export interface CreatedFolder {
  id: string;
  name: string;
  parentId: string | null;
  spaceId: string;
}

interface CreateFolderDialogProps {
  parentId?: string | null;
  spaceId: string;
  /** Called after a successful create with the new folder. */
  onCreated: (folder: CreatedFolder) => void;
}

export function CreateFolderDialog({ parentId = null, spaceId, onCreated }: CreateFolderDialogProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");

    try {
      const { data, error: actionError } = await actions.folder.create({
        name: name.trim(),
        parentId,
        spaceId,
      });
      if (actionError) {
        throw new Error(
          friendlyActionErrorMessage(
            actionError.message,
            "We couldn't create the folder. Please try again.",
          ),
        );
      }
      if (!data?.folder) throw new Error("Folder was created but no data returned");
      onCreated({
        id: data.folder.id,
        name: data.folder.name,
        parentId: data.folder.parentId ?? null,
        spaceId: data.folder.spaceId,
      });
      setSaving(false);
      setOpen(false);
      setName("");
      setError("");
    } catch (err) {
      setError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't create the folder. Please try again.",
        ),
      );
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    setOpen(false);
    setName("");
    setError("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary sm:px-5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
        <span className="hidden sm:inline">New Folder</span>
      </button>

      <Modal
        isOpen={open}
        onClose={close}
        closeOnBackdropClick={!saving}
        closeOnEscape={!saving}
        showCloseButton={!saving}
        ariaLabelledBy={headingId}
        size="sm"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          Create folder
        </h2>
        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="folder-name">
              Folder name
            </label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
              className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              placeholder="Marketing assets"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
