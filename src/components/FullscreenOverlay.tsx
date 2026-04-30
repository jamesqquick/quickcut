import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface FullscreenOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  contentClassName?: string;
}

export function FullscreenOverlay({
  isOpen,
  onClose,
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  ariaLabel,
  ariaLabelledBy,
  className = "bg-black/80 backdrop-blur-sm",
  contentClassName,
}: FullscreenOverlayProps) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      const toFocus = previouslyFocusedRef.current;
      if (toFocus && document.contains(toFocus)) {
        requestAnimationFrame(() => toFocus.focus());
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [closeOnEscape, isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onMouseDown={() => {
        if (closeOnBackdropClick) onClose();
      }}
      className={`fixed inset-0 z-50 flex h-screen w-screen items-center justify-center overflow-y-auto ${className}`}
    >
      <div className={contentClassName} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
