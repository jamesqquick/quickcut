import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import type { InlineEditorField } from "./InlineEditor";

interface MetadataFieldProps {
  videoId: string;
  field: InlineEditorField;
  initialValue: string | null;
  isOwner: boolean;
  label: string;
  placeholder: string;
  multiline?: boolean;
  maxLength?: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Always-on form-style metadata field. Owners see an input/textarea they can
 * type into directly; non-owners see the value as plain read-only text. Saves
 * on blur (or Cmd/Ctrl+Enter for multiline) and shows a transient status hint.
 */
export function MetadataField({
  videoId,
  field,
  initialValue,
  isOwner,
  label,
  placeholder,
  multiline,
  maxLength,
}: MetadataFieldProps) {
  const [value, setValue] = useState(initialValue ?? "");
  // The committed value is what we'll diff against on blur to decide whether
  // to send a save request. We update it whenever a save succeeds.
  const committedRef = useRef(initialValue ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  if (!isOwner) {
    const display = value.trim();
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {label}
        </p>
        {display ? (
          <p
            className={`max-w-2xl break-words text-sm text-text-primary ${
              multiline ? "whitespace-pre-wrap" : ""
            }`}
          >
            {display}
          </p>
        ) : (
          <p className="text-sm italic text-text-tertiary">Not set</p>
        )}
      </div>
    );
  }

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === committedRef.current) {
      // Reflect the canonical (trimmed) form in the input without saving.
      if (trimmed !== value) setValue(trimmed);
      return;
    }

    setSaveState("saving");
    try {
      const payload: Record<string, string> = {
        id: videoId,
        [field]: trimmed,
      };
      const { error } = await actions.video.update(payload as never);
      if (error) {
        setSaveState("error");
        return;
      }
      committedRef.current = trimmed;
      setValue(trimmed);
      setSaveState("saved");
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => {
        setSaveState("idle");
      }, 1500);
    } catch {
      setSaveState("error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      setValue(committedRef.current);
      e.currentTarget.blur();
    }
  };

  const baseInputClass =
    "w-full rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary placeholder:italic focus:border-accent-primary focus:outline-none disabled:opacity-60";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          className="text-xs font-semibold uppercase tracking-wide text-text-tertiary"
          htmlFor={`field-${field}`}
        >
          {label}
        </label>
        <span className="text-xs text-text-tertiary" aria-live="polite">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && (
            <span className="text-accent-secondary">Save failed</span>
          )}
        </span>
      </div>
      {multiline ? (
        <textarea
          id={`field-${field}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={saveState === "saving"}
          className={`${baseInputClass} resize-y`}
        />
      ) : (
        <input
          id={`field-${field}`}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={saveState === "saving"}
          className={baseInputClass}
        />
      )}
    </div>
  );
}
