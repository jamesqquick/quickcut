import { useEffect, useId, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { Modal } from "./Modal";
import { Dropdown, type DropdownOption } from "./Dropdown";
import { friendlyActionErrorMessage } from "../lib/errors";

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

interface MoveToFolderDialogProps {
  isOpen: boolean;
  entityId: string;
  entityType: "video" | "folder";
  currentFolderId?: string | null;
  folders: Folder[];
  onClose: () => void;
  /**
   * Called after a successful move with the new parent identifier. For videos
   * this is the new folder id (or null for the space root). For folders this
   * is the new parent folder id (or null for top-level).
   */
  onMoved: (entityId: string, newParentId: string | null) => void;
}

function buildFolderOptions(folders: Folder[], movingFolderId?: string) {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    if (movingFolderId && folder.id === movingFolderId) continue;
    const key = folder.parentId ?? null;
    children.set(key, [...(children.get(key) || []), folder]);
  }

  for (const group of children.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name));
  }

  const excluded = new Set<string>();
  if (movingFolderId) {
    excluded.add(movingFolderId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of folders) {
        if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id);
          changed = true;
        }
      }
    }
  }

  const rows: Array<Folder & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) || []) {
      if (excluded.has(folder.id)) continue;
      rows.push({ ...folder, depth });
      visit(folder.id, depth + 1);
    }
  };

  visit(null, 0);
  return rows;
}

export function MoveToFolderDialog({
  isOpen,
  entityId,
  entityType,
  currentFolderId = null,
  folders,
  onClose,
  onMoved,
}: MoveToFolderDialogProps) {
  const headingId = useId();
  const [selectedFolderId, setSelectedFolderId] = useState<string>(currentFolderId ?? "root");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedFolderId(currentFolderId ?? "root");
    setError("");
  }, [currentFolderId, isOpen]);

  const handleMove = async () => {
    setSaving(true);
    setError("");

    const folderId = selectedFolderId === "root" ? null : selectedFolderId;

    try {
      const fallback =
        entityType === "video"
          ? "Failed to move the project. Please try again."
          : "Failed to move the folder. Please try again.";

      if (entityType === "video") {
        const { error } = await actions.video.move({ id: entityId, folderId });
        if (error) {
          throw new Error(friendlyActionErrorMessage(error.message, fallback));
        }
      } else {
        const { error } = await actions.folder.move({ id: entityId, parentId: folderId });
        if (error) {
          throw new Error(friendlyActionErrorMessage(error.message, fallback));
        }
      }
      onMoved(entityId, folderId);
      setSaving(false);
      onClose();
    } catch (err) {
      setError(
        friendlyActionErrorMessage(
          err instanceof Error ? err.message : null,
          entityType === "video"
            ? "Failed to move the project. Please try again."
            : "Failed to move the folder. Please try again.",
        ),
      );
      setSaving(false);
    }
  };

  const treeOptions = useMemo(
    () => buildFolderOptions(folders, entityType === "folder" ? entityId : undefined),
    [folders, entityType, entityId],
  );

  const dropdownOptions: DropdownOption[] = useMemo(
    () => [
      { value: "root", label: "Projects" },
      ...treeOptions.map((folder) => ({
        value: folder.id,
        label: `${"  ".repeat(folder.depth)}${folder.depth > 0 ? "- " : ""}${folder.name}`,
      })),
    ],
    [treeOptions],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdropClick={!saving}
      closeOnEscape={!saving}
      showCloseButton={!saving}
      ariaLabelledBy={headingId}
      size="md"
    >
      <h2 id={headingId} className="text-lg font-semibold text-text-primary">
        Move to folder
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Choose where this {entityType} should live.
      </p>

      <div className="mt-5 space-y-2">
        <label className="block text-sm font-medium text-text-secondary" htmlFor="folder-select">
          Destination
        </label>
        <Dropdown
          id="folder-select"
          options={dropdownOptions}
          value={selectedFolderId}
          onChange={setSelectedFolderId}
          disabled={saving}
          menuAlign="left"
          menuWidth="w-full"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-accent-danger/15 px-4 py-2 text-sm break-words text-accent-danger">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleMove}
          disabled={saving}
          className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Moving..." : "Move"}
        </button>
      </div>
    </Modal>
  );
}
