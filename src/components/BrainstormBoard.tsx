import { useMemo, useState } from "react";
import { Button } from "./Button";
import { BrainstormCard } from "./BrainstormCard";
import { NewBrainstormDialog } from "./NewBrainstormDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import type {
  BrainstormItem,
  BrainstormStatus,
  FolderTreeOption,
} from "../types";

interface BrainstormBoardProps {
  spaceId: string;
  currentUserId: string;
  isOwner: boolean;
  initialBrainstorms: BrainstormItem[];
  folders: FolderTreeOption[];
}

const STATUS_FILTERS: Array<{ key: BrainstormStatus; label: string }> = [
  { key: "open", label: "Open" },
  { key: "promoted", label: "Promoted" },
  { key: "archived", label: "Archived" },
];

function sortBrainstorms(items: BrainstormItem[]): BrainstormItem[] {
  return [...items].sort((a, b) => {
    if (b.reactionCount !== a.reactionCount) {
      return b.reactionCount - a.reactionCount;
    }
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });
}

export function BrainstormBoard({
  spaceId,
  currentUserId,
  isOwner,
  initialBrainstorms,
  folders,
}: BrainstormBoardProps) {
  const [brainstorms, setBrainstorms] = useState<BrainstormItem[]>(initialBrainstorms);
  const [activeStatus, setActiveStatus] = useState<BrainstormStatus>("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BrainstormItem | null>(null);
  const [promoting, setPromoting] = useState<BrainstormItem | null>(null);

  const counts = useMemo(() => {
    const out: Record<BrainstormStatus, number> = { open: 0, promoted: 0, archived: 0 };
    for (const item of brainstorms) {
      out[item.status] += 1;
    }
    return out;
  }, [brainstorms]);

  const visible = useMemo(
    () => sortBrainstorms(brainstorms.filter((item) => item.status === activeStatus)),
    [brainstorms, activeStatus],
  );

  const handleSaved = () => {
    setCreateOpen(false);
    setEditing(null);
    window.location.reload();
  };

  const handleChanged = (next: BrainstormItem) => {
    setBrainstorms((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  };

  const handleDeleted = (id: string) => {
    setBrainstorms((prev) => prev.filter((item) => item.id !== id));
  };

  const emptyCopy = (() => {
    if (activeStatus === "open") {
      return {
        heading: "No ideas yet",
        body: "Capture something your team should make a video about.",
      };
    }
    if (activeStatus === "promoted") {
      return {
        heading: "Nothing promoted yet",
        body: "Once an idea becomes a project, it'll show up here.",
      };
    }
    return {
      heading: "Nothing archived",
      body: "Archived ideas will appear here.",
    };
  })();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((filter) => {
            const isActive = filter.key === activeStatus;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveStatus(filter.key)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent-primary/15 text-text-primary"
                    : "text-text-secondary hover:bg-bg-tertiary"
                }`}
                aria-pressed={isActive}
              >
                {filter.label}
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${
                    isActive
                      ? "bg-accent-primary text-white"
                      : "bg-bg-tertiary text-text-tertiary"
                  }`}
                >
                  {counts[filter.key]}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          aria-label="Capture a new idea"
          icon={(
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        >
          New Idea
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary px-6 py-16 text-center">
          <h2 className="text-lg font-semibold text-text-primary">{emptyCopy.heading}</h2>
          <p className="mt-2 text-sm text-text-secondary">{emptyCopy.body}</p>
          {activeStatus === "open" && (
            <div className="mt-5">
              <Button onClick={() => setCreateOpen(true)}>Add the first idea</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map((brainstorm) => (
            <BrainstormCard
              key={brainstorm.id}
              brainstorm={brainstorm}
              spaceId={spaceId}
              currentUserId={currentUserId}
              isOwner={isOwner}
              onEdit={(item) => setEditing(item)}
              onPromote={(item) => setPromoting(item)}
              onChanged={handleChanged}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <NewBrainstormDialog
        isOpen={createOpen || editing !== null}
        spaceId={spaceId}
        editingId={editing?.id}
        initialTitle={editing?.title}
        initialNotes={editing?.notes}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <NewProjectDialog
        spaceId={spaceId}
        folderId={null}
        folders={folders}
        triggerHidden
        isOpenExternal={promoting !== null}
        onClose={() => setPromoting(null)}
        initialTitle={promoting?.title ?? ""}
        initialDescription={promoting?.notes ?? ""}
        brainstormId={promoting?.id}
      />
    </div>
  );
}
