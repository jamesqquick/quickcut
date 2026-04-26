import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveToFolderDialog } from "./MoveToFolderDialog";

interface VideoCardMenuProps {
  videoId: string;
  folderId?: string | null;
}

export function VideoCardMenu({ videoId, folderId = null }: VideoCardMenuProps) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const requestDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setConfirmOpen(true);
  };

  const requestMove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setMoveOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        // Refresh dashboard to remove the card.
        window.location.reload();
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      alert(data?.error || "Failed to delete video");
    } catch {
      alert("Failed to delete video");
    }
    setDeleting(false);
    setConfirmOpen(false);
  };

  const stopAndToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={stopAndToggle}
          disabled={deleting}
          className={`flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white transition-opacity duration-150 hover:bg-black/80 focus:opacity-100 disabled:opacity-50 ${
            open || confirmOpen
            || moveOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label="Video options"
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
            className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={requestMove}
              disabled={deleting}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              Move to folder
            </button>
            <button
              role="menuitem"
              onClick={requestDelete}
              disabled={deleting}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent-danger transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>

      <MoveToFolderDialog
        isOpen={moveOpen}
        entityId={videoId}
        entityType="video"
        currentFolderId={folderId}
        onClose={() => setMoveOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete this video?"
        description="This action cannot be undone. The video and all its comments and share links will be permanently deleted."
        confirmLabel="Delete video"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
