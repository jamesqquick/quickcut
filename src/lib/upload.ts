import * as tus from "tus-js-client";

export const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"] as const;
export const ALLOWED_EXTENSIONS_ACCEPT = ".mp4,.mov,.webm,.avi,.mkv";
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
export const TUS_CHUNK_SIZE = 52_428_800;
export const TUS_RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV.";
  }
  if (file.size > MAX_FILE_SIZE) return "File exceeds the 5GB limit.";
  return null;
}

export interface StartTusUploadOptions {
  file: File;
  uploadUrl: string;
  onProgress: (percent: number) => void;
  onSuccess: () => void;
  onError: (err: Error) => void;
}

export function startTusUpload({
  file,
  uploadUrl,
  onProgress,
  onSuccess,
  onError,
}: StartTusUploadOptions): tus.Upload {
  const upload = new tus.Upload(file, {
    uploadUrl,
    chunkSize: TUS_CHUNK_SIZE,
    retryDelays: TUS_RETRY_DELAYS,
    metadata: {
      name: file.name,
      filetype: file.type,
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      if (bytesTotal > 0) {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      }
    },
    onSuccess,
    onError,
  });
  upload.start();
  return upload;
}
