import { useState, useRef, useCallback } from "react";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

type UploadState = "idle" | "selected" | "uploading" | "processing" | "error";

interface UploadFormProps {
  folderId?: string | null;
}

export function UploadForm({ folderId = null }: UploadFormProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File exceeds the 5GB limit.";
    }
    return null;
  };

  const handleFileSelect = (f: File) => {
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setState("error");
      return;
    }
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
    setError("");
    setState("selected");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setState("uploading");
    setProgress(0);
    setError("");

    try {
      // Step 1: Get upload URL from our API
      const res = await fetch("/api/videos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          folderId,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to create upload");
      }

      const { videoId, uploadUrl } = await res.json() as {
        videoId: string;
        uploadUrl: string;
      };

      // Step 2: Upload directly to Cloudflare Stream via TUS
      const xhr = new XMLHttpRequest();
      xhr.open("PATCH", uploadUrl);
      xhr.setRequestHeader("Tus-Resumable", "1.0.0");
      xhr.setRequestHeader("Upload-Offset", "0");
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setState("processing");
          // Redirect to video detail page
          setTimeout(() => {
            window.location.href = `/videos/${videoId}`;
          }, 1500);
        } else {
          setError("Upload failed. Please try again.");
          setState("error");
        }
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

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="h-12 w-12 animate-pulse rounded-full bg-accent-primary/30" />
        <p className="text-lg font-semibold text-text-primary">Upload complete!</p>
        <p className="text-sm text-text-secondary">
          Your video is being processed. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px]">
      {(state === "idle" || state === "error") && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-16 transition-colors duration-150 ${
              dragOver
                ? "border-accent-primary bg-accent-primary/5"
                : "border-border-default hover:border-border-hover"
            }`}
          >
            <svg className="h-12 w-12 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <div className="text-center">
              <p className="text-lg font-semibold text-text-primary">Drop your video here</p>
              <p className="mt-1 text-sm text-text-tertiary">or click to browse</p>
            </div>
            <p className="text-xs text-text-tertiary">MP4, MOV, WebM, AVI, MKV up to 5GB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.webm,.avi,.mkv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
          {error && (
            <div className="mt-4 rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
              {error}
            </div>
          )}
        </>
      )}

      {(state === "selected" || state === "uploading") && file && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-secondary p-4">
            <svg className="h-8 w-8 shrink-0 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
              <p className="text-xs text-text-tertiary">{formatFileSize(file.size)}</p>
            </div>
            {state === "selected" && (
              <button
                onClick={() => {
                  setFile(null);
                  setState("idle");
                }}
                className="text-text-tertiary transition-colors hover:text-text-primary"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={state === "uploading"}
                className="w-full rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
                placeholder="Video title"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Description <span className="text-text-tertiary">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={state === "uploading"}
                rows={3}
                className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-50"
                placeholder="Add a description..."
              />
            </div>
          </div>

          {state === "uploading" && (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Uploading...</span>
                <span className="font-mono text-text-primary">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className="h-full rounded-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-accent-danger/15 px-4 py-2 text-sm text-accent-danger">
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={state === "uploading" || !title.trim()}
            className="w-full rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-accent-hover hover:shadow-[0_2px_8px_rgba(108,92,231,0.3)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "uploading" ? "Uploading..." : "Upload Video"}
          </button>
        </div>
      )}
    </div>
  );
}
