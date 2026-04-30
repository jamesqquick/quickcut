import { useId, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface NewProjectDialogProps {
  spaceId: string;
  folderId?: string | null;
}

export function NewProjectDialog({ spaceId, folderId = null }: NewProjectDialogProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (saving) return;
    setOpen(false);
    setTitle("");
    setDescription("");
    setError("");
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/videos/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          spaceId,
          folderId,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; videoId?: string } | null;
      if (!res.ok || !data?.videoId) throw new Error(data?.error || "Failed to create project");
      window.location.href = `/videos/${data.videoId}?space=${spaceId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-label="Create a new video project"
        icon={(
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        )}
      >
        New Project
      </Button>

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

          {error && (
            <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
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
