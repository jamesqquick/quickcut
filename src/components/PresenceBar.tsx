import type { Viewer } from "../lib/realtime";

interface PresenceBarProps {
  viewers: Viewer[];
  loading?: boolean;
}

const MAX_VISIBLE = 4;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function PresenceBarSkeleton() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default animate-pulse">
      <div className="flex -space-x-2">
        <div className="h-7 w-7 rounded-full border-2 border-bg-secondary bg-bg-tertiary" />
        <div className="h-7 w-7 rounded-full border-2 border-bg-secondary bg-bg-tertiary" />
      </div>
      <div className="h-3 w-16 rounded bg-bg-tertiary" />
    </div>
  );
}

export function PresenceBar({ viewers, loading }: PresenceBarProps) {
  if (loading) return <PresenceBarSkeleton />;
  if (viewers.length === 0) return null;

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default">
      <div className="flex -space-x-2">
        {visible.map((viewer, i) => (
          <div
            key={viewer.userId ?? `anon-${viewer.name}-${i}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-secondary bg-accent-primary text-[10px] font-medium text-white"
            title={viewer.name}
          >
            {getInitials(viewer.name)}
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-secondary bg-bg-tertiary text-[10px] font-medium text-text-secondary">
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-xs text-text-tertiary">
        {viewers.length === 1
          ? "1 watching"
          : `${viewers.length} watching`}
      </span>
    </div>
  );
}
