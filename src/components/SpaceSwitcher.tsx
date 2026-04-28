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
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-tertiary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text-primary">{space.name}</span>
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
                <svg className="h-4 w-4 shrink-0 overflow-visible" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 2.5h3l.4 2a6.8 6.8 0 011.4.8l1.9-.7 1.5 2.6-1.5 1.3a6.9 6.9 0 010 1.6l1.5 1.3-1.5 2.6-1.9-.7a6.8 6.8 0 01-1.4.8l-.4 2h-3l-.4-2a6.8 6.8 0 01-1.4-.8l-1.9.7-1.5-2.6 1.5-1.3a6.9 6.9 0 010-1.6L3.3 7.2l1.5-2.6 1.9.7a6.8 6.8 0 011.4-.8l.4-2z" />
                  <circle cx="10" cy="9.3" r="2.2" />
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
