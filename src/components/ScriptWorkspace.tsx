import { useEffect, useMemo, useRef, useState } from "react";
import { Mark } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import type { Comment, CommentUrgency, ScriptStatus, TextRange } from "../types";
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
  scriptStatus: ScriptStatus;
  submitForReviewEventName?: string;
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
  scriptStatus,
  submitForReviewEventName,
}: ScriptWorkspaceProps) {
  const [currentScriptStatus, setCurrentScriptStatus] = useState(scriptStatus);
  const [comments, setComments] = useState(() => initialComments.filter((comment) => comment.phase === "script"));
  const [selectedRange, setSelectedRange] = useState<TextRange | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentUrgency, setCommentUrgency] = useState<CommentUrgency>("suggestion");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [submittingForReview, setSubmittingForReview] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const hasEditedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReviewMode = currentScriptStatus === "review";
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
      hasEditedRef.current = true;
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

  const submitForReview = async () => {
    if (submittingForReview) return;
    setSubmittingForReview(true);
    try {
      if (editor && hasEditedRef.current) {
        await saveScript(JSON.stringify(editor.getJSON()), editor.getText());
      }
      const res = await fetch(`/api/videos/${videoId}/script-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "review" }),
      });
      if (!res.ok) throw new Error("Failed to submit script for review");
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingForReview(false);
    }
  };

  useEffect(() => {
    if (!submitForReviewEventName) return;
    const handleSubmitForReview = () => {
      void submitForReview();
    };
    window.addEventListener(submitForReviewEventName, handleSubmitForReview);
    return () => window.removeEventListener(submitForReviewEventName, handleSubmitForReview);
  }, [submitForReviewEventName, submitForReview]);

  return (
    <div className={isReviewMode ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" : "space-y-5"}>
      <div className="space-y-5">
        <div className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{isReviewMode ? "Script Review" : "Write Script"}</h2>
              <p className="text-xs text-text-tertiary">
                {isReviewMode
                  ? "Select text to attach feedback directly to a script passage."
                  : "Write in Markdown. When the script is ready, submit it for feedback."}
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

      {isReviewMode && <aside className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary">
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
        <div className="p-4">
          <h2 className="text-sm font-semibold text-text-primary">Script Feedback</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {selectedRange ? `Selected: “${selectedRange.quote.slice(0, 90)}${selectedRange.quote.length > 90 ? "..." : ""}”` : "Select script text to leave contextual feedback."}
          </p>

          {!readOnly && (
            <div className="mt-4 space-y-3 rounded-lg border border-border-default bg-bg-primary p-3">
            <label className="block text-xs font-medium text-text-secondary" htmlFor="script-feedback-comment">
              Comment
            </label>
            <textarea
              id="script-feedback-comment"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.shiftKey) {
                  event.preventDefault();
                  void createScriptComment();
                }
              }}
              rows={3}
              disabled={!selectedRange || submittingComment}
              placeholder="Add feedback on the selected text..."
              className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            />
            <p className="text-[11px] text-text-tertiary">Press Shift + Enter to submit.</p>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary" htmlFor="script-feedback-urgency">
                Feedback type
              </label>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${URGENCY_META[commentUrgency].dot}`} aria-hidden="true" />
                <select
                  id="script-feedback-urgency"
                  value={commentUrgency}
                  onChange={(event) => setCommentUrgency(event.target.value as CommentUrgency)}
                  disabled={!selectedRange || submittingComment}
                  className="min-w-0 flex-1 rounded-lg border border-border-default bg-bg-input px-2 py-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
                >
                  {URGENCY_OPTIONS.map((urgency) => (
                    <option key={urgency} value={urgency}>
                      {URGENCY_META[urgency].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={createScriptComment}
                disabled={!selectedRange || !commentText.trim() || submittingComment}
                className="rounded-lg bg-accent-primary px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {submittingComment ? "Adding..." : "Comment"}
              </button>
            </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
          {filteredComments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-default p-4 text-center text-sm text-text-tertiary">
              {filter === "all"
                ? "No script feedback yet."
                : filter === "unresolved"
                  ? "No unresolved script feedback."
                  : "No resolved script feedback."}
            </div>
          ) : (
            filteredComments.map((comment) => {
              const meta = URGENCY_META[comment.urgency];
              const displayName = comment.displayName || currentUserName;
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
                        {comment.textRange && (
                          <blockquote className="mt-2 border-l-2 border-accent-primary pl-2 text-xs text-text-tertiary">
                            {comment.textRange.quote}
                          </blockquote>
                        )}
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
                            const replyDisplayName = reply.displayName || currentUserName;
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
      </aside>}
    </div>
  );
}
