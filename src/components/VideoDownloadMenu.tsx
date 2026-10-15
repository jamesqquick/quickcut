import { useEffect, useRef, useState } from "react";
import { useVideoDownload } from "../hooks/useVideoDownload";
import { ToastViewport, useToast } from "./Toast";

interface VideoDownloadMenuItemProps {
  preparingDownload: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function VideoDownloadMenuItem({ preparingDownload, onClick, disabled = false }: VideoDownloadMenuItemProps) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      disabled={preparingDownload || disabled}
      aria-busy={preparingDownload}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {preparingDownload ? "Preparing MP4..." : "Download"}
    </button>
  );
}

interface VideoDownloadMenuProps {
  videoId: string;
  shareToken: string;
}

export function VideoDownloadMenu({ videoId, shareToken }: VideoDownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toasts, showToast, dismissToast } = useToast();
  const { preparingDownload, downloadVideo } = useVideoDownload({
    videoId,
    shareToken,
    onDownloaded: () => setOpen(false),
    onError: (message) => showToast(message, "error"),
  });

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <div
        className="relative"
        ref={menuRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg">
            <VideoDownloadMenuItem preparingDownload={preparingDownload} onClick={downloadVideo} />
          </div>
        )}
      </div>
    </>
  );
}
