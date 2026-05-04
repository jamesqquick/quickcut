import { actions } from "astro:actions";
import { useState } from "react";

interface EmailNotificationToggleProps {
  enabled: boolean;
}

export function EmailNotificationToggle({ enabled }: EmailNotificationToggleProps) {
  const [emailEnabled, setEmailEnabled] = useState(enabled);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    if (toggling) return;
    const next = !emailEnabled;
    setToggling(true);
    try {
      const { error } = await actions.setEmailPreference({ enabled: next });
      if (!error) setEmailEnabled(next);
    } catch {
      // Keep current state on failure
    } finally {
      setToggling(false);
    }
  };

  return (
    <button
      role="switch"
      aria-checked={emailEnabled}
      aria-label="Email notifications"
      onClick={handleToggle}
      disabled={toggling}
      className="flex w-full items-center justify-between rounded-lg border border-border-default bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary disabled:opacity-50"
    >
      <div className="text-left">
        <div className="text-sm font-medium text-text-primary">Email notifications</div>
        <div className="mt-0.5 text-xs text-text-tertiary">
          Receive an email when someone comments on your video or replies to your comment.
        </div>
      </div>
      <span
        className={`relative ml-4 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${emailEnabled ? "bg-accent-primary" : "bg-bg-tertiary"}`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${emailEnabled ? "translate-x-5" : "translate-x-1"}`}
        />
      </span>
    </button>
  );
}
