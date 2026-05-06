import { useEffect, useId, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { friendlyActionErrorMessage } from "../lib/errors";
import type { FolderTreeOption } from "../types";

interface NewProjectDialogProps {
  spaceId: string;
  folderId?: string | null;
  folders: FolderTreeOption[];
  initialTitle?: string;
  initialDescription?: string;
  brainstormId?: string;
  triggerLabel?: string;
  triggerHidden?: boolean;
  isOpenExternal?: boolean;
  onClose?: () => void;
  onCreated?: (result: { videoId: string; folderId: string | null }) => void;
}

function buildFolderRows(folders: FolderTreeOption[]) {
  const children = new Map<string | null, FolderTreeOption[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    children.set(key, [...(children.get(key) || []), folder]);
  }
  for (const group of children.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name));
  }
  const rows: Array<FolderTreeOption & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) || []) {
      rows.push({ ...folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export function NewProjectDialog({
  spaceId,
  folderId = null,
  folders,
  initialTitle = "",
  initialDescription = "",
  brainstormId,
  triggerLabel = "New Project",
  triggerHidden = false,
  isOpenExternal,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const headingId = useId();
  const isControlled = typeof isOpenExternal === "boolean";
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? isOpenExternal! : internalOpen;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    folderId ?? "root",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setDescription(initialDescription);
    setSelectedFolderId(folderId ?? "root");
    setError("");
  }, [open, initialTitle, initialDescription, folderId]);

  const folderRows = useMemo(() => buildFolderRows(folders), [folders]);
  const dropdownOptions: DropdownOption[] = useMemo(
    () => [
      { value: "root", label: "Space root" },
      ...folderRows.map((folder) => ({
        value: folder.id,
        label: `${"  ".repeat(folder.depth)}${folder.depth > 0 ? "- " : ""}${folder.name}`,
      })),
    ],
    [folderRows],
  );

  const close = () => {
    if (saving) return;
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
    setError("");
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError("");

    const targetFolderId = selectedFolderId === "root" ? null : selectedFolderId;

    try {
      const { data, error: actionError } = await actions.video.createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        spaceId,
        folderId: targetFolderId,
      });
      if (actionError || !data?.videoId) {
        throw new Error(actionError?.message || "");
      }

      if (brainstormId) {
        try {
          await actions.brainstorm.markPromoted({
            id: brainstormId,
            videoId: data.videoId,
          });
        } catch (err) {
          console.error("[NewProjectDialog] markPromoted failed", err);
        }
      }

      onCreated?.({ videoId: data.videoId, folderId: targetFolderId });
      window.location.href = `/videos/${data.videoId}?space=${spaceId}`;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          "We couldn't create the project. Please try again.",
        ),
      );
      setSaving(false);
    }
  };

  return (
    <>
      {!triggerHidden && !isControlled && (
        <Button
          onClick={() => setInternalOpen(true)}
          aria-label="Create a new video project"
          className="px-3 py-2.5 sm:px-5"
          icon={(
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
            </svg>
          )}
        >
          <span className="hidden sm:inline">{triggerLabel}</span>
        </Button>
      )}

      <Modal
        isOpen={open}
        onClose={close}
        closeOnBackdropClick={!saving}
        closeOnEscape={!saving}
        showCloseButton={!saving}
        ariaLabelledBy={headingId}
        size="md"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          Create video project
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Create a workspace with an empty script and an optional video upload.
        </p>

        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="project-title">
              Project title
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
              autoFocus
              className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              placeholder="Launch video"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="project-description">
              Description <span className="text-text-tertiary">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              rows={3}
              className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              placeholder="Add a project description..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="project-folder">
              Folder
            </label>
            <Dropdown
              id="project-folder"
              options={dropdownOptions}
              value={selectedFolderId}
              onChange={setSelectedFolderId}
              disabled={saving}
              menuAlign="left"
              menuWidth="w-full"
            />
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
              {saving ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
