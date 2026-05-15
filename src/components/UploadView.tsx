import { useRef, useState } from "react";
import { actions } from "astro:actions";
import { friendlyActionErrorMessage } from "../lib/errors";
import { ALLOWED_EXTENSIONS_ACCEPT, formatFileSize } from "../lib/upload";
import { useTusUpload } from "../hooks/useTusUpload";

interface UploadViewProps {
  videoId: string;
  isFirstCut: boolean;
  transcriptsEnabled: boolean;
}

export function UploadView({
  videoId,
  isFirstCut,
  transcriptsEnabled,
}: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [versionNotes, setVersionNotes] = useState("");
  const [generateTranscript, setGenerateTranscript] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { state, file, progress, error, selectFile, startUpload } = useTusUpload();

  const upload = () => {
    void startUpload({
      resolveUploadTarget: async () => {
        if (!file) {
          throw new Error("No file selected.");
        }
        const { data, error: actionError } = isFirstCut
          ? await actions.video.uploadFirstCut({
              id: videoId,
              fileName: file.name,
              fileSize: file.size,
              generateTranscript: transcriptsEnabled ? generateTranscript : false,
            })
          : await actions.video.uploadVersion({
              id: videoId,
              fileName: file.name,
              fileSize: file.size,
              generateTranscript: transcriptsEnabled ? generateTranscript : false,
              versionNotes: versionNotes.trim() || undefined,
            });

        if (actionError || !data?.uploadUrl) {
          throw new Error(
            friendlyActionErrorMessage(
              actionError?.message,
              "Failed to start the upload. Please try again.",
            ),
          );
        }

        return {
          uploadUrl: data.uploadUrl,
          videoId: data.videoId || videoId,
        };
      },
      onComplete: (targetVideoId) => {
        window.location.href = `/videos/${targetVideoId}?tab=video`;
      },
    });
  };

  return (
    <section className="rounded-xl border border-border-default bg-bg-secondary p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-text-primary">
          {isFirstCut ? "Upload Video" : "Upload new version"}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {isFirstCut
            ? "Upload a video when you are ready to share a cut for feedback."
            : "Create the next version in this stack. Existing comments stay on their original version."}
        </p>
      </div>

      <div className="space-y-4">
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
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-accent-primary bg-accent-primary/5" : "border-border-default hover:border-border-hover"}`}
          >
            <p className="text-sm font-medium text-text-primary">Drop your video here</p>
            <p className="mt-1 text-xs text-text-tertiary">or click to browse MP4, MOV, WebM, AVI, or MKV</p>
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

        {!isFirstCut && (
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
        )}

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
              <span className="block text-sm font-medium text-text-primary">Generate transcript after upload</span>
              <span className="mt-1 block text-xs text-text-tertiary">Create a transcript after the upload finishes processing.</span>
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

        {state === "processing" && (
          <p className="rounded-lg bg-accent-secondary/15 px-4 py-2 text-sm text-accent-secondary">
            Upload complete. Returning to the project...
          </p>
        )}

        {error && <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger break-words">{error}</div>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={upload}
            disabled={!file || state === "uploading"}
            className="rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
          >
            {state === "uploading" ? "Uploading..." : isFirstCut ? "Upload Video" : "Upload Version"}
          </button>
        </div>
      </div>
    </section>
  );
}
