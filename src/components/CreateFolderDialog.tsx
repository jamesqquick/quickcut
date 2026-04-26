import { useId, useState } from "react";
import { Modal } from "./Modal";

interface CreateFolderDialogProps {
  parentId?: string | null;
}

export function CreateFolderDialog({ parentId = null }: CreateFolderDialogProps) {
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
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId }),
      });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Failed to create folder");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
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
        className="rounded-lg border border-border-default px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
      >
        New Folder
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
            <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
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
