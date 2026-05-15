import { useEffect, useMemo, useState } from "react";
import { actions } from "astro:actions";
import { Modal } from "./Modal";
import { friendlyActionErrorMessage } from "../lib/errors";

interface SpaceMemberOption {
  userId: string;
  name: string;
  email?: string;
  role: "owner" | "member";
}

interface RequestApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  videoId: string;
  spaceId: string;
  /** Currently signed-in user; excluded from the list. */
  currentUserId: string;
  /** Video uploader; excluded because uploaders cannot approve their own video. */
  uploadedBy: string | null;
  /** Notify caller of a successful request so it can show a toast. */
  onRequested?: (count: number) => void;
}

/**
 * Modal that fetches space members and lets the uploader/owner pick a subset
 * to ping for approval. Filters by name/email, supports keyboard interaction
 * via standard form controls, and submits via `actions.video.requestApprovals`.
 */
export function RequestApprovalDialog({
  open,
  onClose,
  videoId,
  spaceId,
  currentUserId,
  uploadedBy,
  onRequested,
}: RequestApprovalDialogProps) {
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<SpaceMemberOption[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setFilter("");
    setSubmitError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);
    fetch(`/api/spaces/${spaceId}/members`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load space members (${res.status})`);
        const data = (await res.json()) as { members: SpaceMemberOption[] };
        setMembers(data.members);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setFetchError(
          friendlyActionErrorMessage(
            err instanceof Error ? err.message : null,
            "We couldn't load space members. Please refresh and try again.",
          ),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [open, spaceId]);

  const eligibleMembers = useMemo(() => {
    if (!members) return [];
    return members.filter(
      (m) => m.userId !== currentUserId && m.userId !== uploadedBy,
    );
  }, [members, currentUserId, uploadedBy]);

  const filteredMembers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return eligibleMembers;
    return eligibleMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }, [eligibleMembers, filter]);

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await actions.video.requestApprovals({
        id: videoId,
        userIds: Array.from(selected),
      });
      if (error) {
        setSubmitError(
          friendlyActionErrorMessage(
            error.message,
            "We couldn't send the approval requests. Please try again.",
          ),
        );
        return;
      }
      onRequested?.(data?.created ?? 0);
      onClose();
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      ariaLabelledBy="request-approval-heading"
    >
      <div>
        <h2
          id="request-approval-heading"
          className="text-lg font-semibold text-text-primary"
        >
          Request approval
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Pick the people you want to review this cut. They will get an in-app
          notification and an email if they have email notifications enabled.
        </p>

        <div className="mt-4">
          <label
            htmlFor="request-approval-filter"
            className="sr-only"
          >
            Filter members
          </label>
          <input
            id="request-approval-filter"
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name or email"
            className="w-full rounded-lg border border-border-default bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
          />
        </div>

        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border-default bg-bg-primary">
          {loading && (
            <p className="p-4 text-center text-sm text-text-tertiary">
              Loading members…
            </p>
          )}
          {!loading && fetchError && (
            <p className="p-4 text-center text-sm break-words text-accent-danger" role="alert">
              {fetchError}
            </p>
          )}
          {!loading && !fetchError && eligibleMembers.length === 0 && (
            <p className="p-4 text-center text-sm text-text-tertiary">
              No other space members are available to review.
            </p>
          )}
          {!loading &&
            !fetchError &&
            eligibleMembers.length > 0 &&
            filteredMembers.length === 0 && (
              <p className="p-4 text-center text-sm text-text-tertiary">
                No members match &ldquo;{filter}&rdquo;.
              </p>
            )}
          {!loading && filteredMembers.length > 0 && (
            <ul className="divide-y divide-border-default">
              {filteredMembers.map((member) => {
                const isSelected = selected.has(member.userId);
                return (
                  <li key={member.userId}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-bg-tertiary">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(member.userId)}
                        className="h-4 w-4 shrink-0 accent-accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {member.name}
                          {member.role === "owner" && (
                            <span className="ml-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                              Owner
                            </span>
                          )}
                        </span>
                        {member.email && (
                          <span className="block truncate text-xs text-text-tertiary">
                            {member.email}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {submitError && (
          <p
            className="mt-3 text-sm break-words text-accent-danger"
            role="alert"
          >
            {submitError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border-default px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitting}
            className="rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting
              ? "Sending…"
              : selected.size === 0
                ? "Request approval"
                : `Request from ${selected.size} ${selected.size === 1 ? "person" : "people"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
