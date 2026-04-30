import { useRef, useState } from "react";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

type UploadState = "idle" | "selected" | "uploading" | "processing" | "error";

interface UploadViewProps {
  videoId: string;
  title: string;
  description: string;
  isFirstCut: boolean;
  transcriptsEnabled: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function UploadView({
  videoId,
  title: initialTitle,
  description: initialDescription,
  isFirstCut,
  transcriptsEnabled,
}: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [generateTranscript, setGenerateTranscript] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const validateFile = (selectedFile: File): string | null => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV.";
    }
    if (selectedFile.size > MAX_FILE_SIZE) return "File exceeds the 5GB limit.";
    return null;
  };

  const selectFile = (selectedFile: File) => {
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      setState("error");
      return;
    }
    setFile(selectedFile);
    setError("");
    setState("selected");
  };

  const upload = async () => {
    if (!file) return;

    setState("uploading");
    setError("");
    setProgress(0);

    try {
      const res = await fetch(`/api/videos/${videoId}/${isFirstCut ? "first-cut" : "versions"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          title: isFirstCut ? undefined : title.trim() || undefined,
          description: isFirstCut ? undefined : description.trim(),
          generateTranscript: transcriptsEnabled ? generateTranscript : false,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { videoId?: string; uploadUrl?: string; error?: string }
        | null;

      if (!res.ok || !data?.uploadUrl) throw new Error(data?.error || "Failed to create upload");

      const targetVideoId = data.videoId || videoId;
      const xhr = new XMLHttpRequest();
      xhr.open("PATCH", data.uploadUrl);
      xhr.setRequestHeader("Tus-Resumable", "1.0.0");
      xhr.setRequestHeader("Upload-Offset", "0");
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setState("processing");
          window.location.href = `/videos/${targetVideoId}`;
          return;
        }
        setError("Upload failed. Please try again.");
        setState("error");
      };

      xhr.onerror = () => {
        setError("Upload failed. Please try again.");
        setState("error");
      };

      xhr.send(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
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
              accept=".mp4,.mov,.webm,.avi,.mkv"
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
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Title</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={state === "uploading"}
                className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={state === "uploading"}
                rows={3}
                className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary focus:border-accent-primary focus:outline-none disabled:opacity-50"
              />
            </div>
          </>
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

        {error && <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">{error}</div>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={upload}
            disabled={!file || (!isFirstCut && !title.trim()) || state === "uploading"}
            className="rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover disabled:opacity-50"
          >
            {state === "uploading" ? "Uploading..." : isFirstCut ? "Upload Video" : "Upload Version"}
          </button>
        </div>
      </div>
    </section>
  );
}
