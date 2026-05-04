import { useEffect } from "react";
import { ToastViewport, useToast, type ToastVariant } from "./Toast";

interface PendingToastPayload {
  message: string;
  variant?: ToastVariant;
}

const STORAGE_KEY = "pendingToast";

function readPendingToast(): PendingToastPayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as PendingToastPayload;
    if (!parsed || typeof parsed.message !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Mounts a toast viewport that consumes a one-shot toast persisted to
 * `sessionStorage` under the `pendingToast` key. This lets pages that perform
 * a full-page navigation (e.g. after deleting a resource) still surface a
 * confirmation toast on the destination page.
 */
export function PendingToast() {
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    const pending = readPendingToast();
    if (!pending) return;
    showToast(pending.message, pending.variant ?? "success");
    // showToast is stable for our purposes — only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ToastViewport toasts={toasts} onDismiss={dismissToast} />;
}
