import { useEffect, useRef, useState } from "react";

interface VersionSummary {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  versionNumber: number;
  isCurrentVersion: boolean;
  createdAt: string;
  commentCount: number;
}

interface VersionSwitcherProps {
  videoId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function VersionSwitcher({ videoId }: VersionSwitcherProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/videos/${videoId}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { versions?: VersionSummary[] } | null) => {
        if (!cancelled && data?.versions) setVersions(data.versions);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [videoId]);

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

  if (versions.length <= 1) return null;

  const currentVersion = versions.find((version) => version.id === videoId) || versions[0];

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        V{currentVersion.versionNumber} of {versions.length}
        <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="fixed left-1/2 top-24 z-50 max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-secondary p-2 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:translate-x-0"
        >
          <div className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            Versions
          </div>
          {versions.map((version) => (
            <a
              key={version.id}
              role="menuitem"
              href={`/videos/${version.id}`}
              className={`flex gap-3 rounded-lg p-2 transition-colors hover:bg-bg-tertiary ${version.id === videoId ? "bg-bg-tertiary" : ""}`}
            >
              <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-primary">
                {version.thumbnailUrl ? (
                  <img src={version.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-text-tertiary">V{version.versionNumber}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">V{version.versionNumber}</span>
                  {version.isCurrentVersion && (
                    <span className="rounded-full bg-accent-secondary/15 px-2 py-0.5 text-[10px] font-medium text-accent-secondary">
                      Current
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-text-secondary">{version.title}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {formatDate(version.createdAt)} - {version.commentCount} comment{version.commentCount === 1 ? "" : "s"}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
