import { useState, useEffect, useRef } from "react";
import { StatusDropdown, type ReviewStatus } from "./StatusDropdown";

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
  reviewStatus: ReviewStatus;
}

export function VideoHeader({ videoId, shareLink: initialLink, appUrl, reviewStatus }: VideoHeaderProps) {
  const [shareLink, setShareLink] = useState(initialLink);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const createOrRegenerate = async () => {
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/share/manage/${videoId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareLink(data.shareLink);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const revokeLink = async () => {
    if (!shareLink) return;
    if (!confirm("Revoke this share link? Anyone with the link will lose access.")) {
      return;
    }
    setLoading(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/share/manage/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        setShareLink(null);
      }
    } catch {
      // ignore
    }
    setLoading(false);
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
    setPopoverOpen((o) => !o);
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-2">
      <a
        href="/dashboard"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        aria-label="Back to library"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M12.707 4.293a1 1 0 010 1.414L8.414 10l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </a>

      <div className="ml-auto flex items-center gap-2">
        <StatusDropdown videoId={videoId} initialStatus={reviewStatus} />

        <div className="relative" ref={popoverRef}>
          <button
            onClick={handleShareClick}
            className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover"
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
          >
            Share
          </button>

        {popoverOpen && (
          <div
            role="dialog"
            aria-label="Share video"
            className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border-default bg-bg-secondary p-4 shadow-xl"
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
                        className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg"
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
                          onClick={revokeLink}
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
  );
}
