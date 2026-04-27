import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "./Modal";
import type { SpaceWithRole } from "../lib/spaces";

interface SpaceSwitcherProps {
  spaces: SpaceWithRole[];
  selectedSpaceId: string | null;
}

interface CreateSpaceResponse {
  space?: {
    id: string;
    name: string;
  };
  error?: string;
}

function buildUrlForSpace(spaceId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("space", spaceId);
  url.searchParams.delete("folderId");
  if (url.pathname.startsWith("/spaces/")) {
    url.pathname = `/spaces/${spaceId}/settings`;
  } else if (url.pathname !== "/upload") {
    url.pathname = "/dashboard";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function SpaceSwitcher({ spaces, selectedSpaceId }: SpaceSwitcherProps) {
  const headingId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0] ?? null;
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [requiredApprovals, setRequiredApprovals] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectSpace = (spaceId: string) => {
    window.location.href = buildUrlForSpace(spaceId);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), requiredApprovals }),
      });
      const data = (await res.json().catch(() => null)) as CreateSpaceResponse | null;
      if (!res.ok || !data?.space) throw new Error(data?.error || "Failed to create space");
      selectSpace(data.space.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
      setSaving(false);
    }
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
    setName("");
    setRequiredApprovals(0);
    setError("");
  };

  if (!selectedSpace) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="truncate font-medium">{selectedSpace.name}</span>
          <span className="hidden rounded-full bg-bg-tertiary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-tertiary sm:inline">
            {selectedSpace.role}
          </span>
          <svg className="h-4 w-4 shrink-0 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border-default bg-bg-secondary py-1 shadow-xl"
          >
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                role="menuitem"
                onClick={() => selectSpace(space.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-tertiary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text-primary">{space.name}</span>
                  <span className="text-xs text-text-tertiary">{space.requiredApprovals} required approvals</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary">
                    {space.role}
                  </span>
                  {space.id === selectedSpace.id && <span className="h-2 w-2 rounded-full bg-accent-primary" aria-label="Selected" />}
                </span>
              </button>
            ))}

            <div className="mt-1 border-t border-border-default py-1">
              <a
                role="menuitem"
                href={`/spaces/${selectedSpace.id}/settings?space=${selectedSpace.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.653.854.102.05.203.103.302.159.325.183.72.188 1.04-.004l1.096-.658a1.125 1.125 0 011.45.191l1.832 1.832c.389.389.47.995.191 1.45l-.658 1.096c-.192.32-.187.715-.004 1.04.056.099.109.2.159.302.168.34.48.59.854.653l1.281.213c.542.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213a1.125 1.125 0 00-.854.653 6.963 6.963 0 01-.159.302c-.183.325-.188.72.004 1.04l.658 1.096c.279.455.198 1.061-.191 1.45l-1.832 1.832a1.125 1.125 0 01-1.45.191l-1.096-.658a1.125 1.125 0 00-1.04-.004c-.099.056-.2.109-.302.159a1.125 1.125 0 00-.653.854l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281a1.125 1.125 0 00-.653-.854 6.963 6.963 0 01-.302-.159 1.125 1.125 0 00-1.04.004l-1.096.658a1.125 1.125 0 01-1.45-.191l-1.832-1.832a1.125 1.125 0 01-.191-1.45l.658-1.096c.192-.32.187-.715.004-1.04a6.963 6.963 0 01-.159-.302 1.125 1.125 0 00-.854-.653l-1.281-.213a1.125 1.125 0 01-.94-1.11v-2.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.854-.653.05-.102.103-.203.159-.302.183-.325.188-.72-.004-1.04l-.658-1.096a1.125 1.125 0 01.191-1.45l1.832-1.832a1.125 1.125 0 011.45-.191l1.096.658c.32.192.715.187 1.04.004.099-.056.2-.109.302-.159.34-.168.59-.48.653-.854l.213-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </a>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent-primary transition-colors hover:bg-bg-tertiary"
              >
                <span className="text-lg leading-none">+</span>
                Create Space
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={createOpen}
        onClose={closeCreate}
        closeOnBackdropClick={!saving}
        closeOnEscape={!saving}
        showCloseButton={!saving}
        ariaLabelledBy={headingId}
        size="sm"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">Create space</h2>
        <p className="mt-1 text-sm text-text-secondary">Add a workspace for videos, folders, and reviewers.</p>
        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="space-name">Name</label>
            <input
              id="space-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
              autoFocus
              className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              placeholder="Marketing Team"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="space-approvals">Required approvals</label>
            <input
              id="space-approvals"
              type="number"
              min={0}
              max={100}
              value={requiredApprovals}
              onChange={(event) => setRequiredApprovals(parseInt(event.target.value) || 0)}
              disabled={saving}
              className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            />
          </div>
          {error && <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={closeCreate} disabled={saving} className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50">
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
