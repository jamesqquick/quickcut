import { useEffect, useRef, useState } from "react";

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
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  const [emailToggling, setEmailToggling] = useState(false);
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

  // Fetch email preference when menu opens
  useEffect(() => {
    if (!open || emailEnabled !== null) return;
    fetch("/api/notifications/email-preference", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => setEmailEnabled(data.emailNotificationsEnabled ?? false))
      .catch(() => setEmailEnabled(false));
  }, [open, emailEnabled]);

  const handleEmailToggle = async () => {
    if (emailToggling) return;
    const next = !emailEnabled;
    setEmailToggling(true);
    try {
      await fetch("/api/notifications/email-preference", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
        credentials: "same-origin",
      });
      setEmailEnabled(next);
    } catch {
      // Revert on failure
    } finally {
      setEmailToggling(false);
    }
  };

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
          <button
            role="menuitem"
            onClick={handleEmailToggle}
            disabled={emailToggling}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
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
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
            <span className="flex-1">Email notifications</span>
            <span
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${emailEnabled ? "bg-accent-primary" : "bg-bg-tertiary"}`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${emailEnabled ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </span>
          </button>
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
