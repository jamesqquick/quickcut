import { useEffect, useRef, useState } from "react";
import { connectUserNotifications } from "../lib/notifications-realtime";

interface UserMenuProps {
  name: string;
  email: string;
  notificationCount?: number;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserMenu({ name, email, notificationCount = 0 }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(notificationCount);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasNotifications = count > 0;

  useEffect(() => {
    setCount(notificationCount);
  }, [notificationCount]);

  useEffect(() => {
    const handler = () => setCount((current) => Math.max(0, current - 1));
    window.addEventListener("quickcut:invite-accepted", handler);
    window.addEventListener("quickcut:notification-read", handler);
    return () => {
      window.removeEventListener("quickcut:invite-accepted", handler);
      window.removeEventListener("quickcut:notification-read", handler);
    };
  }, []);

  // Real-time badge increments. The header SSRs the initial count on every
  // navigation, so this only needs to handle notifications that arrive while
  // the page is open. Other parts of the app can listen for the same event
  // (e.g. to show toasts or live-update the /notifications page) without
  // opening their own socket.
  useEffect(() => {
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail === "object" && detail.kind === "invite") {
        // Defer to the SSR'd source of truth on next navigation; for now
        // any invite/notification simply increments the badge.
      }
      setCount((current) => current + 1);
    };
    window.addEventListener("quickcut:notification-received", onNotification);

    const conn = connectUserNotifications({
      onNotification: (notification) => {
        window.dispatchEvent(
          new CustomEvent("quickcut:notification-received", {
            detail: notification,
          }),
        );
      },
    });

    return () => {
      window.removeEventListener(
        "quickcut:notification-received",
        onNotification,
      );
      conn.disconnect();
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);

    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "same-origin",
    });

    window.location.assign("/");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-white transition-all duration-150 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary"
      >
        {getInitials(name)}
        {hasNotifications && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-accent-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white ring-2 ring-bg-primary">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border-default bg-bg-secondary py-1 shadow-xl"
        >
          <div className="px-4 py-3">
            <div className="truncate text-sm font-semibold text-text-primary">
              {name}
            </div>
            <div className="mt-0.5 truncate text-xs text-text-tertiary">
              {email}
            </div>
          </div>
          <div className="border-t border-border-default" />
          <a
            role="menuitem"
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            <svg
              className="h-4 w-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            <span className="flex-1">Notifications</span>
            {hasNotifications && (
              <span className="rounded-full bg-accent-danger px-2 py-0.5 text-xs font-semibold text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </a>
          <a
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            <svg
              className="h-4 w-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </a>
          <div className="border-t border-border-default" />
          <button
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            <svg
              className="h-4 w-4 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
