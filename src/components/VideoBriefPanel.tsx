import { useState } from "react";

interface VideoBriefPanelProps {
  hook: string | null;
  takeaway1: string | null;
  takeaway2: string | null;
  takeaway3: string | null;
}

/**
 * Read-only display of the video's "brief" — hook + 3 takeaways — surfaced on
 * the review (Video) tab so reviewers can see authorial intent alongside the
 * cut. Hidden entirely when none of the fields are populated.
 */
export function VideoBriefPanel({
  hook,
  takeaway1,
  takeaway2,
  takeaway3,
}: VideoBriefPanelProps) {
  const takeaways = [takeaway1, takeaway2, takeaway3].filter(
    (t): t is string => !!t && t.trim().length > 0,
  );
  const hasHook = !!hook && hook.trim().length > 0;
  const hasContent = hasHook || takeaways.length > 0;
  const [expanded, setExpanded] = useState(false);

  if (!hasContent) return null;

  return (
    <details
      className="group rounded-xl border border-border-default bg-bg-secondary"
      open={expanded}
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-tertiary">
        <span className="inline-flex items-center gap-2">
          <svg
            className="h-4 w-4 text-text-tertiary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Project brief
        </span>
        <svg
          className={`h-4 w-4 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>

      <div className="space-y-4 border-t border-border-default px-4 py-4">
        {hasHook && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Hook
            </p>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{hook}</p>
          </div>
        )}
        {takeaways.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Takeaways
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              {takeaways.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}
