import { useState, useEffect, useRef } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { VersionSwitcher } from "./VersionSwitcher";

interface ShareLink {
  id: string;
  token: string;
  status: string;
  viewCount: number;
}

interface VideoHeaderProps {
  videoId: string;
  shareLink: ShareLink | null;
  appUrl: string;
  spaceId: string;
  backHref: string;
  showScriptLink?: boolean;
  spaceName?: string;
  uploadVersionHref?: string | null;
}

export function VideoHeader({ videoId, shareLink: initialLink, appUrl, spaceId, backHref, showScriptLink = false, spaceName, uploadVersionHref = null }: VideoHeaderProps) {
  const [shareLink, setShareLink] = useState(initialLink);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const shareUrl = shareLink ? `${appUrl}/s/${shareLink.token}` : null;

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  // Close overflow menu on outside click (within popover)
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close header overflow menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreMenuOpen]);

  const requestDeleteVideo = () => {
    setMoreMenuOpen(false);
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteVideo = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { redirectVideoId?: string | null }
          | null;
        window.location.href = data?.redirectVideoId ? `/videos/${data.redirectVideoId}?space=${spaceId}` : `/dashboard?space=${spaceId}`;
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
    setConfirmDeleteOpen(false);
  };

  const createOrRegenerate = async () => {
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/share/manage/${videoId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { shareLink?: ShareLink };
        setShareLink(data.shareLink ?? null);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const requestRevokeLink = () => {
    if (!shareLink) return;
    setMenuOpen(false);
    setConfirmRevokeOpen(true);
  };

  const confirmRevokeLink = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/share/manage/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        setShareLink(null);
      }
    } catch {
      // ignore
    }
    setLoading(false);
    setConfirmRevokeOpen(false);
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShareClick = () => {
    // If no link exists yet, create one immediately when opening the popover
    if (!shareLink && !loading) {
      createOrRegenerate();
    }
    setMoreMenuOpen(false);
    setPopoverOpen((o) => !o);
  };

  return (
    <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <a
          href={backHref}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary sm:px-3"
          aria-label="Back to videos"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12.707 4.293a1 1 0 010 1.414L8.414 10l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span className="hidden text-sm font-medium sm:inline">Back to videos</span>
        </a>

        {spaceName && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border-default bg-bg-secondary px-3 py-1.5 text-sm text-text-secondary">
            <span className="text-text-tertiary">Space</span>
            <span className="truncate font-medium text-text-primary">{spaceName}</span>
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <VersionSwitcher videoId={videoId} />

        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setMoreMenuOpen((o) => !o)}
            disabled={deleting}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>

          {moreMenuOpen && (
            <div
              role="menu"
              className="fixed left-1/2 top-24 z-50 w-48 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:translate-x-0"
            >
              {showScriptLink && (
                <a
                  role="menuitem"
                  href={`/videos/${videoId}/script?space=${spaceId}`}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                  View script
                </a>
              )}
              <button
                role="menuitem"
                type="button"
                onClick={handleShareClick}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
              {uploadVersionHref && (
                <a
                  role="menuitem"
                  href={uploadVersionHref}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload new version
                </a>
              )}
              <button
                role="menuitem"
                onClick={requestDeleteVideo}
                disabled={deleting}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent-danger transition-colors hover:bg-bg-tertiary disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete video
              </button>
            </div>
          )}

          {popoverOpen && (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Share video"
            className="fixed left-1/2 top-24 z-50 max-h-[70vh] w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-secondary p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:translate-x-0"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Share for review</h3>
              <button
                onClick={() => {
                  setPopoverOpen(false);
                  setMenuOpen(false);
                }}
                className="text-text-tertiary transition-colors hover:text-text-primary"
                aria-label="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <p className="mb-3 text-xs text-text-secondary">
              Anyone with the link can view and leave comments.
            </p>

            {!shareLink ? (
              <button
                disabled
                className="w-full rounded-lg bg-bg-tertiary px-3 py-2 text-sm font-medium text-text-tertiary"
              >
                {loading ? "Generating link…" : "Preparing…"}
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl || ""}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate rounded-lg border border-border-default bg-bg-input px-3 py-2 text-xs text-text-secondary"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="shrink-0 rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">
                    {shareLink.viewCount} view{shareLink.viewCount !== 1 ? "s" : ""}
                  </span>

                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOpen((o) => !o)}
                      disabled={loading}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
                      aria-label="Share link options"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {menuOpen && (
                      <div
                        role="menu"
                        className="fixed left-1/2 top-40 z-[60] w-44 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-1 sm:translate-x-0"
                      >
                        <button
                          role="menuitem"
                          onClick={createOrRegenerate}
                          disabled={loading}
                          className="block w-full px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                        >
                          Regenerate link
                        </button>
                        <button
                          role="menuitem"
                          onClick={requestRevokeLink}
                          disabled={loading}
                          className="block w-full px-3 py-2 text-left text-xs text-accent-danger transition-colors hover:bg-bg-tertiary disabled:opacity-50"
                        >
                          Revoke link
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>

    <ConfirmDialog
      isOpen={confirmDeleteOpen}
      title="Delete this video?"
      description="This action cannot be undone. The video and all its comments and share links will be permanently deleted."
      confirmLabel="Delete video"
      variant="danger"
      loading={deleting}
      onConfirm={confirmDeleteVideo}
      onCancel={() => setConfirmDeleteOpen(false)}
    />

    <ConfirmDialog
      isOpen={confirmRevokeOpen}
      title="Revoke share link?"
      description="Anyone with the link will lose access. You can generate a new link any time."
      confirmLabel="Revoke link"
      variant="danger"
      loading={loading}
      onConfirm={confirmRevokeLink}
      onCancel={() => setConfirmRevokeOpen(false)}
    />
    </>
  );
}
