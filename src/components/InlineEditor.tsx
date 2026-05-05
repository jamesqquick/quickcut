import { useState, useRef, useEffect } from "react";
import { actions } from "astro:actions";

export type InlineEditorField =
  | "title"
  | "description"
  | "targetAudience"
  | "hook"
  | "takeaway1"
  | "takeaway2"
  | "takeaway3"
  | "primaryCta"
  | "outro";

interface InlineEditorProps {
  value: string;
  field: InlineEditorField;
  videoId: string;
  isOwner: boolean;
  as?: "h1" | "p";
  placeholder?: string;
  className?: string;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  /** Maximum number of characters allowed. */
  maxLength?: number;
}

export function InlineEditor({
  value: initialValue,
  field,
  videoId,
  isOwner,
  as: Tag = "p",
  placeholder = "Click to edit...",
  className = "",
  multiline,
  maxLength,
}: InlineEditorProps) {
  // Title and description preserve their historical multiline behavior:
  // title is single-line, description is multi-line. New fields opt in via
  // the explicit `multiline` prop.
  const isMultiline =
    multiline !== undefined ? multiline : field === "description";

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Keep displayed value in sync if the parent updates `value` prop.
  useEffect(() => {
    if (!isEditing) {
      setValue(initialValue);
    }
  }, [initialValue, isEditing]);

  const save = async () => {
    const trimmed = value.trim();
    // Title is the only required field; empty input reverts to original.
    if (!trimmed && field === "title") {
      setValue(initialValue);
      setIsEditing(false);
      return;
    }

    if (trimmed === initialValue) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      // For optional metadata fields, an empty string clears the value.
      // The server normalizes "" to null, so we just send the trimmed string.
      const payload: Record<string, string> = {
        id: videoId,
        [field]: trimmed,
      };
      const { error } = await actions.video.update(payload as never);
      if (!error) {
        setValue(trimmed);
      } else {
        setValue(initialValue);
      }
    } catch {
      setValue(initialValue);
    }
    setSaving(false);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Single-line fields commit on Enter. Multi-line fields commit on
    // Cmd/Ctrl+Enter so newlines stay accessible.
    if (e.key === "Enter" && !isMultiline) {
      e.preventDefault();
      save();
    }
    if (e.key === "Enter" && isMultiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      setValue(initialValue);
      setIsEditing(false);
    }
  };

  if (!isOwner) {
    const readOnlyMultilineStyles = isMultiline
      ? "w-full min-h-[2.5rem] whitespace-pre-wrap"
      : "";
    return (
      <Tag className={`${readOnlyMultilineStyles} ${className}`}>
        {value || placeholder}
      </Tag>
    );
  }

  if (isEditing) {
    if (isMultiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          disabled={saving}
          rows={3}
          maxLength={maxLength}
          className={`w-full resize-none rounded-lg border border-accent-primary bg-bg-input px-3 py-2 text-sm text-text-primary focus:outline-none ${className}`}
          placeholder={placeholder}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        maxLength={maxLength}
        className={`w-full rounded-lg border border-accent-primary bg-bg-input px-3 py-2 text-text-primary focus:outline-none ${className}`}
        placeholder={placeholder}
      />
    );
  }

  const multilineStyles = isMultiline
    ? "w-full min-h-[5.25rem] whitespace-pre-wrap border border-accent-primary/25 py-2 hover:border-accent-primary/50"
    : "";
  const displayPadding = isMultiline ? "px-3" : "px-0 py-0";

  return (
    <Tag
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer rounded-lg ${displayPadding} transition-colors hover:bg-bg-tertiary ${multilineStyles} ${className} ${!value ? "text-text-tertiary italic" : ""}`}
      title="Click to edit"
    >
      {value || placeholder}
    </Tag>
  );
}
