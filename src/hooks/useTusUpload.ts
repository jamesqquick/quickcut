import { useCallback, useRef, useState } from "react";
import type * as tus from "tus-js-client";
import { friendlyActionErrorMessage } from "../lib/errors";
import { startTusUpload, validateFile } from "../lib/upload";

export type UploadState = "idle" | "selected" | "uploading" | "processing" | "error";

export interface ResolvedUploadTarget {
  uploadUrl: string;
  videoId: string;
}

export interface StartUploadArgs {
  resolveUploadTarget: () => Promise<ResolvedUploadTarget>;
  onComplete: (videoId: string) => void;
}

export interface UseTusUploadResult {
  state: UploadState;
  file: File | null;
  progress: number;
  error: string;
  selectFile: (file: File) => void;
  startUpload: (args: StartUploadArgs) => Promise<void>;
  reset: () => void;
}

export function useTusUpload(): UseTusUploadResult {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const uploadRef = useRef<tus.Upload | null>(null);

  const selectFile = useCallback((selectedFile: File) => {
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      setState("error");
      return;
    }
    setFile(selectedFile);
    setError("");
    setState("selected");
  }, []);

  const reset = useCallback(() => {
    uploadRef.current = null;
    setState("idle");
    setFile(null);
    setProgress(0);
    setError("");
  }, []);

  const startUpload = useCallback(
    async ({ resolveUploadTarget, onComplete }: StartUploadArgs) => {
      if (!file) return;

      setState("uploading");
      setError("");
      setProgress(0);

      try {
        const { uploadUrl, videoId } = await resolveUploadTarget();
        uploadRef.current = startTusUpload({
          file,
          uploadUrl,
          onProgress: setProgress,
          onSuccess: () => {
            setState("processing");
            onComplete(videoId);
          },
          onError: () => {
            setError("Upload failed. Please try again.");
            setState("error");
          },
        });
      } catch (err) {
        setError(
          friendlyActionErrorMessage(
            err instanceof Error ? err.message : null,
            "Upload failed. Please try again.",
          ),
        );
        setState("error");
      }
    },
    [file],
  );

  return { state, file, progress, error, selectFile, startUpload, reset };
}
