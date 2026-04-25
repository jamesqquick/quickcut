import { useState, useRef, useEffect } from "react";

interface InlineEditorProps {
  value: string;
  field: "title" | "description";
  videoId: string;
  isOwner: boolean;
  as?: "h1" | "p";
  placeholder?: string;
  className?: string;
}

export function InlineEditor({
  value: initialValue,
  field,
  videoId,
  isOwner,
  as: Tag = "p",
  placeholder = "Click to edit...",
  className = "",
}: InlineEditorProps) {
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

  const save = async () => {
    const trimmed = value.trim();
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
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: trimmed }),
      });

      if (res.ok) {
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
    if (e.key === "Enter" && field === "title") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      setValue(initialValue);
      setIsEditing(false);
    }
  };

  if (!isOwner) {
    const readOnlyDescStyles =
      field === "description" ? "w-full min-h-[2.5rem] whitespace-pre-wrap" : "";
    return (
      <Tag className={`${readOnlyDescStyles} ${className}`}>
        {value || placeholder}
      </Tag>
    );
  }

  if (isEditing) {
    if (field === "description") {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          disabled={saving}
          rows={3}
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
        className={`w-full rounded-lg border border-accent-primary bg-bg-input px-3 py-2 text-text-primary focus:outline-none ${className}`}
      />
    );
  }

  const descriptionStyles =
    field === "description"
      ? "w-full min-h-[2.5rem] whitespace-pre-wrap border border-accent-primary/25 hover:border-accent-primary/50"
      : "";

  return (
    <Tag
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer rounded-lg px-3 py-1 transition-colors hover:bg-bg-tertiary ${descriptionStyles} ${className} ${!value ? "text-text-tertiary italic" : ""}`}
      title="Click to edit"
    >
      {value || placeholder}
    </Tag>
  );
}
