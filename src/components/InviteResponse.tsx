import { useState } from "react";

interface InviteResponseProps {
  token: string;
  spaceName: string;
  spaceId: string;
}

export function InviteResponse({ token, spaceName, spaceId }: InviteResponseProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);

  const handleAction = async (action: "accept" | "decline") => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/invites/${token}/${action}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) throw new Error(data?.error || `Failed to ${action} invite`);

      setResult(action === "accept" ? "accepted" : "declined");

      if (action === "accept") {
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = `/dashboard?space=${encodeURIComponent(spaceId)}`;
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} invite`);
      setLoading(false);
    }
  };

  if (result === "accepted") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-success/15">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary">
          Welcome to {spaceName}!
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Redirecting to dashboard...
        </p>
      </div>
    );
  }

  if (result === "declined") {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">
          Invite declined
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          You've declined the invite to {spaceName}.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary/15">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-text-primary">
        You've been invited!
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        You've been invited to join <span className="font-medium text-text-primary">{spaceName}</span>.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => handleAction("decline")}
          disabled={loading}
          className="flex-1 rounded-lg border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => handleAction("accept")}
          disabled={loading}
          className="flex-1 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Processing..." : "Accept Invite"}
        </button>
      </div>
    </div>
  );
}
