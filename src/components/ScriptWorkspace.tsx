import { useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import type { Comment, CommentUrgency, TextRange } from "../types";
import { relativeTime } from "../lib/time";
import { connectVideoRoom, type Viewer } from "../lib/realtime";
import { PresenceBar } from "./PresenceBar";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

const URGENCY_META: Record<CommentUrgency, { label: string; description: string; dot: string }> = {
  idea: {
    label: "Idea",
    description: "Concept to consider",
    dot: "bg-accent-primary",
  },
  suggestion: {
    label: "Suggestion",
    description: "Optional, nice-to-have",
    dot: "bg-accent-info",
  },
  important: {
    label: "Important",
    description: "Should be addressed",
    dot: "bg-accent-warning",
  },
  critical: {
    label: "Critical",
    description: "Must be fixed",
    dot: "bg-accent-danger",
  },
};

const URGENCY_OPTIONS: CommentUrgency[] = ["idea", "suggestion", "important", "critical"];

type FilterType = "all" | "unresolved" | "resolved";

function ScriptUrgencyPicker({
  value,
  onChange,
  disabled,
}: {
  value: CommentUrgency;
  onChange: (next: CommentUrgency) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => URGENCY_OPTIONS.indexOf(value));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setActiveIndex(URGENCY_OPTIONS.indexOf(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % URGENCY_OPTIONS.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? URGENCY_OPTIONS.length - 1 : index - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const next = URGENCY_OPTIONS[activeIndex];
        if (next) {
          onChange(next);
          setOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, activeIndex, onChange]);

  const meta = URGENCY_META[value];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Feedback type: ${meta.label}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-tertiary px-3 text-sm text-text-secondary transition-colors hover:bg-bg-input focus:border-accent-primary focus:outline-none disabled:opacity-50"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
        <span>{meta.label}</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select feedback type"
          className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-border-default bg-bg-secondary shadow-lg"
        >
          {URGENCY_OPTIONS.map((urgency, index) => {
            const optionMeta = URGENCY_META[urgency];
            const selected = urgency === value;
            const active = index === activeIndex;
            return (
              <div
                key={urgency}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                className={`group/row flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${active ? "bg-bg-tertiary" : "bg-transparent"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onChange(urgency);
                    setOpen(false);
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${optionMeta.dot}`} aria-hidden="true" />
                  <span className="font-medium text-text-primary">{optionMeta.label}</span>
                  {selected && (
                    <svg className="h-3.5 w-3.5 shrink-0 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span className="text-[11px] text-text-tertiary">{optionMeta.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CommentHighlight = Mark.create({
  name: "commentHighlight",
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => ({ "data-comment-id": attributes.commentId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      {
        ...HTMLAttributes,
        class: "rounded bg-accent-warning/25 px-0.5 text-text-primary decoration-accent-warning underline decoration-2 underline-offset-2",
      },
      0,
    ];
  },
});

interface ScriptWorkspaceProps {
  videoId: string;
  spaceId: string;
  initialContent: string;
  initialComments: Comment[];
  currentUserId: string;
  currentUserName: string;
  readOnly: boolean;
}

function parseInitialContent(content: string): JSONContent {
  if (!content.trim()) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(content) as JSONContent;
    if (parsed?.type === "doc") return parsed;
  } catch {
    // Existing scripts before Tiptap are plain text. Convert them to paragraphs.
  }

  return {
    type: "doc",
    content: content.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

function getTextFromContent(content: JSONContent): string {
  const text = typeof content.text === "string" ? content.text : "";
  const childText = content.content?.map(getTextFromContent).join(" ") ?? "";
  return `${text} ${childText}`.trim();
}

function initialContentHasText(content: string): boolean {
  return getTextFromContent(parseInitialContent(content)).trim().length > 0;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ScriptWorkspace({
  videoId,
  spaceId,
  initialContent,
  initialComments,
  currentUserId,
  currentUserName,
  readOnly,
}: ScriptWorkspaceProps) {
  const [comments, setComments] = useState(() => initialComments.filter((comment) => comment.phase === "script"));
  const [selectedRange, setSelectedRange] = useState<TextRange | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentUrgency, setCommentUrgency] = useState<CommentUrgency>("suggestion");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [hasScriptText, setHasScriptText] = useState(() => initialContentHasText(initialContent));
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReviewMode = true;
  const isReviewModeRef = useRef(isReviewMode);

  useEffect(() => {
    isReviewModeRef.current = isReviewMode;
  }, [isReviewMode]);

  const sortedComments = useMemo(
    () =>
      comments
        .filter((comment) => !comment.parentId)
        .sort((a, b) => Number(a.isResolved) - Number(b.isResolved) || a.createdAt.localeCompare(b.createdAt)),
    [comments],
  );

  const filteredComments = useMemo(
    () =>
      sortedComments.filter((comment) => {
        if (filter === "unresolved") return !comment.isResolved;
        if (filter === "resolved") return comment.isResolved;
        return true;
      }),
    [filter, sortedComments],
  );

  const unresolvedCount = sortedComments.filter((comment) => !comment.isResolved).length;
  const resolvedCount = sortedComments.filter((comment) => comment.isResolved).length;

  const getReplies = (parentId: string) =>
    comments
      .filter((comment) => comment.parentId === parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const saveScript = async (content: string, plainText: string) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/videos/${videoId}/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, plainText }),
      });
      const data = (await res.json().catch(() => null)) as { resolvedCommentIds?: string[] } | null;
      if (!res.ok) throw new Error("Failed to save script");
      if (data?.resolvedCommentIds?.length) {
        const resolvedAt = new Date().toISOString();
        setComments((current) =>
          current.map((comment) =>
            data.resolvedCommentIds!.includes(comment.id)
              ? { ...comment, isResolved: true, resolvedAt, resolvedReason: "text_edited" }
              : comment,
          ),
        );
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Write the hook, outline, or full script here..." }),
      CommentHighlight,
    ],
    content: parseInitialContent(initialContent),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[420px] px-5 py-5 text-sm leading-7 text-text-primary focus:outline-none",
      },
    },
    onSelectionUpdate({ editor }) {
      const { from, to, empty } = editor.state.selection;
      if (empty || readOnly || !isReviewModeRef.current) {
        setSelectedRange(null);
        return;
      }
      const quote = editor.state.doc.textBetween(from, to, " ").trim();
      setSelectedRange(quote ? { from, to, quote } : null);
    },
    onUpdate({ editor }) {
      if (readOnly) return;
      setHasScriptText(editor.getText().trim().length > 0);
      setSaveState("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveScript(JSON.stringify(editor.getJSON()), editor.getText());
      }, 700);
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isReviewMode) {
      setViewers([]);
      setPresenceLoading(false);
      return;
    }

    setPresenceLoading(true);
    const conn = connectVideoRoom(
      videoId,
      {
        viewerName: currentUserName,
        viewerUserId: currentUserId,
      },
      {
        onPresence: (incomingViewers) => {
          setViewers(incomingViewers);
          setPresenceLoading(false);
        },
      },
    );

    return () => {
      conn.disconnect();
      setViewers([]);
      setPresenceLoading(false);
    };
  }, [currentUserId, currentUserName, isReviewMode, videoId]);

  const createScriptComment = async () => {
    if (!editor || !selectedRange || !commentText.trim() || !isReviewMode) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: commentText.trim(),
          urgency: commentUrgency,
          phase: "script",
          timestamp: null,
          textRange: selectedRange,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; comment?: Comment } | null;
      if (!res.ok || !data?.comment) throw new Error(data?.error || "Failed to create comment");

      editor
        .chain()
        .focus()
        .setTextSelection({ from: selectedRange.from, to: selectedRange.to })
        .setMark("commentHighlight", { commentId: data.comment.id })
        .run();
      await saveScript(JSON.stringify(editor.getJSON()), editor.getText());

      setComments((current) => [...current, data.comment!]);
      setCommentText("");
      setSelectedRange(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const toggleResolved = async (comment: Comment) => {
    const nextResolved = !comment.isResolved;
    setComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? { ...item, isResolved: nextResolved, resolvedReason: nextResolved ? "manual" : null }
          : item,
      ),
    );
    try {
      const res = await fetch(`/api/comments/${comment.id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: nextResolved }),
      });
      if (!res.ok) throw new Error("Failed to resolve comment");
    } catch (err) {
      console.error(err);
      setComments((current) => current.map((item) => (item.id === comment.id ? comment : item)));
    }
  };

  const submitReply = async (parentId: string) => {
    if (!replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/comments/${parentId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; comment?: Comment } | null;
      if (!res.ok || !data?.comment) throw new Error(data?.error || "Failed to post reply");

      setComments((current) => (current.some((comment) => comment.id === data.comment!.id) ? current : [...current, data.comment!]));
      setReplyText("");
      setReplyingTo(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const focusComment = (comment: Comment) => {
    if (!editor || !comment.textRange) return;
    editor.chain().focus().setTextSelection({ from: comment.textRange.from, to: comment.textRange.to }).run();
  };

  return (
    <div className={isReviewMode ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" : "space-y-5"}>
      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Script</h2>
              <p className="text-xs text-text-tertiary">
                Write the script here. Select text to attach feedback directly to a passage.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <span className={`text-xs ${saveState === "error" ? "text-accent-danger" : "text-text-tertiary"}`}>
                  {saveState === "saving" ? "Saving..." : saveState === "error" ? "Save failed" : "Saved"}
                </span>
              )}
            </div>
          </div>
          <EditorContent editor={editor} className="script-editor max-h-[560px] overflow-y-auto bg-bg-input" />
        </div>

      </div>

      {isReviewMode && <aside className="flex min-h-[620px] overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
        <div className="flex min-w-0 flex-1 flex-col">
        <PresenceBar viewers={viewers} loading={presenceLoading} />
        <div className="flex border-b border-border-default">
          {(
            [
              { key: "all", label: "All", count: sortedComments.length },
              { key: "unresolved", label: "Unresolved", count: unresolvedCount },
              { key: "resolved", label: "Resolved", count: resolvedCount },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-3 text-sm transition-colors ${
                filter === tab.key
                  ? "border-b-2 border-accent-primary text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tab.label}
              {tab.count > 0 && <span className="ml-1.5 text-xs">({tab.count})</span>}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
          {filteredComments.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-text-tertiary">
                {filter === "all"
                  ? "No comments yet"
                  : filter === "unresolved"
                    ? "No unresolved comments"
                    : "No resolved comments"}
              </p>
              {filter === "all" && (
                <p className="mt-1 text-xs text-text-tertiary">
                  Be the first to leave feedback
                </p>
              )}
            </div>
          ) : (
            filteredComments.map((comment) => {
              const meta = URGENCY_META[comment.urgency];
              const displayName = comment.name || currentUserName;
              const replies = getReplies(comment.id);
              return (
                <article
                  key={comment.id}
                  className={`space-y-3 rounded-lg p-2 -m-2 transition-shadow duration-500 ${
                    comment.isResolved ? "border-l-2 border-accent-secondary pl-3 opacity-50" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-white">
                      {getInitials(displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => focusComment(comment)} className="block w-full text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{displayName}</span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                            title={`${meta.label} comment`}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                            {meta.label}
                          </span>
                          <span className="text-xs text-text-tertiary">{relativeTime(comment.createdAt)}</span>
                          {comment.resolvedReason === "text_edited" && (
                            <span className="rounded-full bg-accent-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-warning">
                              Outdated
                            </span>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{comment.text}</p>
                      </button>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo((current) => (current === comment.id ? null : comment.id))}
                            className="text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
                          >
                            Reply
                          </button>
                        )}
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => toggleResolved(comment)}
                            className="text-xs font-medium text-accent-secondary transition-colors hover:text-accent-secondary/80"
                          >
                            {comment.isResolved ? "Reopen" : "Resolve"}
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-text-tertiary">
                            {comment.isResolved ? "Resolved" : "Open"}
                          </span>
                        )}
                        {comment.resolvedReason === "text_edited" && (
                          <span className="text-xs text-text-tertiary">Auto-resolved because the referenced text changed.</span>
                        )}
                      </div>

                      {replies.length > 0 && (
                        <div className="mt-3 space-y-3 border-l border-border-default pl-4">
                          {replies.map((reply) => {
                            const replyDisplayName = reply.name || currentUserName;
                            return (
                              <div key={reply.id} className="flex gap-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/60 text-[10px] font-medium text-white">
                                  {getInitials(replyDisplayName)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold text-text-primary">{replyDisplayName}</span>
                                    <span className="text-xs text-text-tertiary">{relativeTime(reply.createdAt)}</span>
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-secondary">{reply.text}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {replyingTo === comment.id && (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(event) => setReplyText(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void submitReply(comment.id);
                              }
                            }}
                            placeholder="Write a reply..."
                            className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => submitReply(comment.id)}
                            disabled={submittingReply || !replyText.trim()}
                            className="shrink-0 rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                          >
                            Reply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
          </div>
        </div>
        {readOnly ? (
          <div className="border-t border-border-default px-4 py-3 text-center text-xs text-text-tertiary">
            Comments are locked on published projects.
          </div>
        ) : (
          <div className="border-t border-border-default p-4">
            <div className="mb-2 flex items-center gap-2">
              <ScriptUrgencyPicker
                value={commentUrgency}
                onChange={setCommentUrgency}
                disabled={!selectedRange || submittingComment}
              />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <label className="sr-only" htmlFor="script-feedback-comment">
                Comment
              </label>
              <input
                id="script-feedback-comment"
                type="text"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createScriptComment();
                  }
                }}
                disabled={!selectedRange || submittingComment}
                placeholder="Add a comment..."
                className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={createScriptComment}
                disabled={!selectedRange || !commentText.trim() || submittingComment}
                className="shrink-0 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {submittingComment ? "Adding..." : "Comment"}
              </button>
            </div>
          </div>
        )}
        </div>
      </aside>}
    </div>
  );
}
