import { useEffect, useId, useRef, useState } from "react";
import { actions } from "astro:actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { MoveToFolderDialog } from "./MoveToFolderDialog";
import { ToastViewport, useToast } from "./Toast";
import { friendlyActionErrorMessage } from "../lib/errors";

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

interface FolderCardMenuProps {
  folderId: string;
  folderName: string;
  parentId?: string | null;
  folders: Folder[];
  /** Called after a successful rename. */
  onRenamed: (id: string, name: string) => void;
  /** Called after a successful move. */
  onMoved: (id: string, parentId: string | null) => void;
  /** Called after a successful delete. */
  onDeleted: (id: string) => void;
}

export function FolderCardMenu({
  folderId,
  folderName,
  parentId = null,
  folders,
  onRenamed,
  onMoved,
  onDeleted,
}: FolderCardMenuProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState(folderName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toasts, showToast, dismissToast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(folderName);
  }, [folderName]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const stopAndToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((value) => !value);
  };

  const openRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setName(folderName);
    setError("");
    setOpen(false);
    setRenameOpen(true);
  };

  const openMove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setMoveOpen(true);
  };

  const openDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setConfirmOpen(true);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");

    try {
      const trimmed = name.trim();
      const { error: actionError } = await actions.folder.update({
        id: folderId,
        name: trimmed,
      });
      if (actionError) {
        throw new Error(
          friendlyActionErrorMessage(
            actionError.message,
            "We couldn't rename the folder. Please try again.",
          ),
        );
      }
      onRenamed(folderId, trimmed);
      setSaving(false);
      setRenameOpen(false);
    } catch (err) {
      setError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't rename the folder. Please try again.",
        ),
      );
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const { error: actionError } = await actions.folder.delete({ id: folderId });
      if (actionError) {
        throw new Error(
          friendlyActionErrorMessage(
            actionError.message,
            "We couldn't delete the folder. Please try again.",
          ),
        );
      }
      onDeleted(folderId);
      setSaving(false);
      setConfirmOpen(false);
    } catch (err) {
      showToast(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          "We couldn't delete the folder. Please try again.",
        ),
        "error",
      );
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <div className="relative" ref={menuRef}>
        <button
          onClick={stopAndToggle}
          disabled={saving}
          className={`flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white transition-opacity duration-150 hover:bg-black/80 focus:opacity-100 disabled:opacity-50 ${
            open || renameOpen || moveOpen || confirmOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label="Folder options"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={openRename}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              Rename
            </button>
            <button
              role="menuitem"
              onClick={openMove}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              Move to folder
            </button>
            <button
              role="menuitem"
              onClick={openDelete}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent-danger transition-colors hover:bg-bg-tertiary"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <Modal
        isOpen={renameOpen}
        onClose={() => !saving && setRenameOpen(false)}
        closeOnBackdropClick={!saving}
        closeOnEscape={!saving}
        showCloseButton={!saving}
        ariaLabelledBy={headingId}
        size="sm"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          Rename folder
        </h2>
        <form onSubmit={handleRename} className="mt-5 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
            className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
          />
          {error && (
            <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
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
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <MoveToFolderDialog
        isOpen={moveOpen}
        entityId={folderId}
        entityType="folder"
        currentFolderId={parentId}
        folders={folders}
        onClose={() => setMoveOpen(false)}
        onMoved={onMoved}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete this folder?"
        description="Projects inside this folder will move back to the space root. Nested folders will also be removed."
        confirmLabel="Delete folder"
        variant="danger"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
