import { useEffect, useId, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Dropdown, type DropdownOption } from "./Dropdown";

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
  spaceId?: string | null;
  onClose: () => void;
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
  spaceId = null,
  onClose,
}: MoveToFolderDialogProps) {
  const headingId = useId();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(currentFolderId ?? "root");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedFolderId(currentFolderId ?? "root");
    setError("");
    setLoading(true);

    fetch(spaceId ? `/api/folders?space=${spaceId}` : "/api/folders")
      .then(async (res) => await res.json() as { folders?: Folder[]; error?: string })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setFolders(data.folders || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load folders"))
      .finally(() => setLoading(false));
  }, [currentFolderId, isOpen, spaceId]);

  const handleMove = async () => {
    setSaving(true);
    setError("");

    const folderId = selectedFolderId === "root" ? null : selectedFolderId;
    const endpoint = entityType === "video" ? `/api/videos/${entityId}` : `/api/folders/${entityId}`;
    const body = entityType === "video" ? { folderId } : { parentId: folderId };

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to move item");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move item");
      setSaving(false);
    }
  };

  const treeOptions = buildFolderOptions(folders, entityType === "folder" ? entityId : undefined);

  const dropdownOptions: DropdownOption[] = useMemo(
    () => [
      { value: "root", label: "All Videos" },
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
          disabled={loading || saving}
          menuAlign="left"
          menuWidth="w-full"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
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
          disabled={loading || saving}
          className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Moving..." : "Move"}
        </button>
      </div>
    </Modal>
  );
}
