import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { friendlyActionErrorMessage } from "../lib/errors";
import { relativeTime } from "../lib/time";
import {
  BRAINSTORM_REACTION_EMOJIS,
  type BrainstormItem,
  type BrainstormReactionEmoji,
  type BrainstormReactionSummary,
} from "../types";

interface BrainstormCardProps {
  brainstorm: BrainstormItem;
  spaceId: string;
  currentUserId: string;
  isOwner: boolean;
  onEdit: (brainstorm: BrainstormItem) => void;
  onPromote: (brainstorm: BrainstormItem) => void;
  onChanged: (brainstorm: BrainstormItem) => void;
  onDeleted: (id: string) => void;
}

const STATUS_LABELS: Record<BrainstormItem["status"], string> = {
  open: "Open",
  promoted: "Promoted",
  archived: "Archived",
};

const STATUS_CLASSES: Record<BrainstormItem["status"], string> = {
  open: "bg-accent-primary/15 text-accent-primary",
  promoted: "bg-accent-success/15 text-accent-success",
  archived: "bg-bg-tertiary text-text-tertiary",
};

const NOTES_CLAMP_LIMIT = 240;

export function BrainstormCard({
  brainstorm,
  spaceId,
  currentUserId,
  isOwner,
  onEdit,
  onPromote,
  onChanged,
  onDeleted,
}: BrainstormCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const isAuthor = brainstorm.authorUserId === currentUserId;
  const canManage = isAuthor || isOwner;
  const isPromoted = brainstorm.status === "promoted";
  const isArchived = brainstorm.status === "archived";

  const showLongNotes = brainstorm.notes.length > NOTES_CLAMP_LIMIT;
  const visibleNotes =
    notesExpanded || !showLongNotes
      ? brainstorm.notes
      : `${brainstorm.notes.slice(0, NOTES_CLAMP_LIMIT)}…`;

  const reactionFor = (emoji: BrainstormReactionEmoji): BrainstormReactionSummary | undefined =>
    brainstorm.reactions.find((r) => r.emoji === emoji);

  const handleReact = async (emoji: BrainstormReactionEmoji) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: actionError } = await actions.brainstorm.toggleReaction({
        brainstormId: brainstorm.id,
        emoji,
      });
      if (actionError) throw new Error(actionError.message || "");
      const reactions = (data?.reactions ?? []) as BrainstormReactionSummary[];
      const reactionCount = reactions.reduce((sum, r) => sum + r.count, 0);
      onChanged({ ...brainstorm, reactions, reactionCount });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          "Failed to save your reaction. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setMenuOpen(false);
    setBusy(true);
    setError("");
    try {
      const { error: actionError } = await actions.brainstorm.archive({ id: brainstorm.id });
      if (actionError) throw new Error(actionError.message || "");
      onChanged({ ...brainstorm, status: "archived" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          "Failed to archive the idea. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnarchive = async () => {
    setMenuOpen(false);
    setBusy(true);
    setError("");
    try {
      const { error: actionError } = await actions.brainstorm.unarchive({ id: brainstorm.id });
      if (actionError) throw new Error(actionError.message || "");
      onChanged({ ...brainstorm, status: "open" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          "Failed to restore the idea. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const { error: actionError } = await actions.brainstorm.delete({ id: brainstorm.id });
      if (actionError) throw new Error(actionError.message || "");
      onDeleted(brainstorm.id);
      setConfirmOpen(false);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        friendlyActionErrorMessage(
          raw,
          "Failed to delete the idea. Please try again.",
        ),
      );
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <article className="rounded-xl border border-border-default bg-bg-secondary p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-text-primary break-words">
              {brainstorm.title}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[brainstorm.status]}`}
            >
              {STATUS_LABELS[brainstorm.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            {brainstorm.authorDisplayName} · {relativeTime(brainstorm.createdAt)}
          </p>
        </div>

        {canManage && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Idea options"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
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
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(brainstorm);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
                >
                  Edit
                </button>
                {!isPromoted && !isArchived && (
                  <button
                    role="menuitem"
                    onClick={handleArchive}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
                  >
                    Archive
                  </button>
                )}
                {isArchived && (
                  <button
                    role="menuitem"
                    onClick={handleUnarchive}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-tertiary"
                  >
                    Unarchive
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-accent-danger transition-colors hover:bg-bg-tertiary"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {brainstorm.notes && (
        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-text-secondary">
          {visibleNotes}
          {showLongNotes && (
            <button
              type="button"
              onClick={() => setNotesExpanded((v) => !v)}
              className="ml-1 text-xs font-medium text-accent-primary hover:text-accent-hover"
            >
              {notesExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {isPromoted && brainstorm.promotedProjectId && (
        <a
          href={`/videos/${brainstorm.promotedProjectId}?space=${spaceId}`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-primary hover:text-accent-hover"
        >
          View project
          {brainstorm.promotedProjectTitle ? `: ${brainstorm.promotedProjectTitle}` : ""}
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </a>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {BRAINSTORM_REACTION_EMOJIS.map((emoji) => {
          const summary = reactionFor(emoji);
          const count = summary?.count ?? 0;
          const reactedByMe = summary?.reactedByMe ?? false;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              disabled={busy}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                reactedByMe
                  ? "border-accent-primary bg-accent-primary/15 text-text-primary"
                  : "border-border-default text-text-secondary hover:bg-bg-tertiary"
              }`}
              aria-pressed={reactedByMe}
              aria-label={`React with ${emoji}`}
            >
              <span aria-hidden="true">{emoji}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}

        {!isPromoted && !isArchived && (
          <button
            type="button"
            onClick={() => onPromote(brainstorm)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" ry="2" />
            </svg>
            Create Project
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-accent-danger/15 px-3 py-2 text-xs break-words text-accent-danger">
          {error}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete this idea?"
        description="This idea and all its reactions will be removed. This action cannot be undone."
        confirmLabel="Delete idea"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </article>
  );
}
