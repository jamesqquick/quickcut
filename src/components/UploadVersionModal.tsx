import { useId, useRef, useState } from "react";
import { actions } from "astro:actions";
import { friendlyActionErrorMessage } from "../lib/errors";
import { ALLOWED_EXTENSIONS_ACCEPT, formatFileSize } from "../lib/upload";
import { useTusUpload } from "../hooks/useTusUpload";
import { Modal } from "./Modal";

interface UploadVersionModalProps {
  videoId: string;
  transcriptsEnabled?: boolean;
  // When `open` is provided, the parent controls open state and is
  // responsible for rendering its own trigger. The component's built-in
  // trigger is hidden in this mode.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UploadVersionModal({
  videoId,
  transcriptsEnabled = false,
  open: controlledOpen,
  onOpenChange,
}: UploadVersionModalProps) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [versionNotes, setVersionNotes] = useState("");
  const [generateTranscript, setGenerateTranscript] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { state, file, progress, error, selectFile, startUpload, reset } = useTusUpload();

  const close = () => {
    if (state === "uploading") return;
    setOpen(false);
    setVersionNotes("");
    setGenerateTranscript(false);
    setDragOver(false);
    reset();
  };

  const upload = () => {
    void startUpload({
      resolveUploadTarget: async () => {
        if (!file) {
          throw new Error("No file selected.");
        }
        const { data, error: actionError } = await actions.video.uploadVersion({
          id: videoId,
          fileName: file.name,
          fileSize: file.size,
          generateTranscript: transcriptsEnabled ? generateTranscript : false,
          versionNotes: versionNotes.trim() || undefined,
        });

        if (actionError || !data?.videoId || !data.uploadUrl) {
          throw new Error(
            friendlyActionErrorMessage(
              actionError?.message,
              "Failed to start the upload. Please try again.",
            ),
          );
        }

        return { uploadUrl: data.uploadUrl, videoId: data.videoId };
      },
      onComplete: (newVideoId) => {
        window.location.href = `/videos/${newVideoId}?tab=video`;
      },
    });
  };

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload new version
        </button>
      )}

      <Modal
        isOpen={open}
        onClose={close}
        closeOnBackdropClick={state !== "uploading"}
        closeOnEscape={state !== "uploading"}
        showCloseButton={state !== "uploading"}
        ariaLabelledBy={headingId}
        size="md"
      >
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">Upload new version</h2>
        <p className="mt-1 text-sm text-text-secondary">
          This creates the next version in the stack. Existing comments stay on their original version.
        </p>

        <div className="mt-5 space-y-4">
          {!file && (
            <div
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const selectedFile = event.dataTransfer.files[0];
                if (selectedFile) selectFile(selectedFile);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? "border-accent-primary bg-accent-primary/5" : "border-border-default hover:border-border-hover"}`}
            >
              <p className="text-sm font-medium text-text-primary">Drop the next cut here</p>
              <p className="mt-1 text-xs text-text-tertiary">or click to browse</p>
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];
                  if (selectedFile) selectFile(selectedFile);
                }}
              />
            </div>
          )}

          {file && (
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-3">
              <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
              <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">What changed?</label>
            <textarea
              value={versionNotes}
              onChange={(event) => setVersionNotes(event.target.value)}
              disabled={state === "uploading"}
              rows={3}
              maxLength={2000}
              placeholder="Example: tightened intro, replaced b-roll at 0:42, fixed audio levels."
              className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Optional. Summarize what reviewers should look for in this cut.
            </p>
          </div>

          {transcriptsEnabled && (
            <label className="flex cursor-pointer gap-3 rounded-xl border border-border-default bg-bg-tertiary p-3 transition-colors hover:border-border-hover">
              <input
                type="checkbox"
                checked={generateTranscript}
                onChange={(event) => setGenerateTranscript(event.target.checked)}
                disabled={state === "uploading"}
                className="mt-1 h-4 w-4 rounded border-border-default bg-bg-input text-accent-primary focus:ring-accent-primary disabled:opacity-50"
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">Generate transcript for this version</span>
                <span className="mt-1 block text-xs text-text-tertiary">Create a transcript after the new version finishes processing.</span>
              </span>
            </label>
          )}

          {state === "uploading" && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Uploading...</span>
                <span className="font-mono text-text-primary">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                <div className="h-full rounded-full bg-accent-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger break-words">{error}</div>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              disabled={state === "uploading"}
              className="flex-1 rounded-lg border border-border-default px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={upload}
              disabled={!file || state === "uploading"}
              className="flex-1 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
            >
              {state === "uploading" ? "Uploading..." : "Upload version"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
