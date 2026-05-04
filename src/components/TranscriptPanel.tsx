import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptStatus } from "../lib/transcript-status";

interface TranscriptRecord {
  status: TranscriptStatus;
  rawText: string | null;
  cleanedText: string | null;
  errorMessage: string | null;
}

interface TranscriptResponse {
  transcript: TranscriptRecord | null;
  transcriptRequested: boolean;
  transcriptsEnabled: boolean;
  videoStatus: string;
}

interface TranscriptPanelProps {
  videoId: string;
  videoTitle: string;
  transcriptsEnabled: boolean;
  apiUrl?: string;
  canManageTranscript?: boolean;
}

const statusCopy: Record<TranscriptStatus, { title: string; body: string }> = {
  not_requested: {
    title: "Transcript not generated",
    body: "Generate a transcript when you want a searchable text version of this video.",
  },
  requested: {
    title: "Transcript requested",
    body: "The transcript will start after the video finishes processing.",
  },
  queued: {
    title: "Transcript queued",
    body: "The transcript job is queued and will start shortly.",
  },
  exporting_audio: {
    title: "Preparing audio",
    body: "We are asking Cloudflare Stream for an audio-only version of the video.",
  },
  waiting_for_audio: {
    title: "Waiting for audio",
    body: "Cloudflare Stream is preparing the audio file for transcription.",
  },
  transcribing: {
    title: "Transcribing audio",
    body: "Workers AI is turning the audio into text.",
  },
  cleaning: {
    title: "Cleaning transcript",
    body: "An LLM is improving punctuation, paragraphs, and readability.",
  },
  ready: {
    title: "Transcript ready",
    body: "",
  },
  ready_raw_only: {
    title: "Transcript ready",
    body: "This transcript has not been formatted. It may contain minor punctuation or capitalization issues.",
  },
  failed: {
    title: "Transcript failed",
    body: "Something went wrong while generating this transcript.",
  },
  skipped_feature_disabled: {
    title: "Transcript unavailable",
    body: "Transcript generation is currently disabled for this account.",
  },
};

const FAST_POLL_STATUSES: TranscriptStatus[] = ["requested", "queued", "exporting_audio"];
const SLOW_POLL_STATUSES: TranscriptStatus[] = ["waiting_for_audio", "transcribing", "cleaning"];
const FAST_INTERVAL = 4_000;
const SLOW_INTERVAL = 12_000;

function isFinalStatus(status: TranscriptStatus): boolean {
  return ["ready", "ready_raw_only", "failed", "skipped_feature_disabled", "not_requested"].includes(status);
}

function getPollInterval(status: TranscriptStatus): number | null {
  if (FAST_POLL_STATUSES.includes(status)) return FAST_INTERVAL;
  if (SLOW_POLL_STATUSES.includes(status)) return SLOW_INTERVAL;
  return null;
}

export function TranscriptPanel({
  videoId,
  videoTitle,
  transcriptsEnabled,
  apiUrl,
  canManageTranscript = true,
}: TranscriptPanelProps) {
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(apiUrl ?? `/api/videos/${videoId}/transcript`);
      if (!response.ok) throw new Error("Failed to load transcript");
      const next = (await response.json()) as TranscriptResponse;
      setData(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcript");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const status: TranscriptStatus = data?.transcript?.status ?? (data?.transcriptRequested ? "requested" : "not_requested");

  useEffect(() => {
    if (!data) return;

    const interval = getPollInterval(status);
    if (!interval) return;

    const schedule = () => {
      pollRef.current = setTimeout(async () => {
        await load();
        schedule();
      }, interval);
    };
    schedule();

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [data, status, load]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/videos/${videoId}/transcript`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Failed to generate transcript");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate transcript");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-border-default bg-bg-secondary p-4">
        <p className="text-sm text-text-secondary">Loading transcript status...</p>
      </section>
    );
  }

  const text = data?.transcript?.cleanedText || data?.transcript?.rawText || "";

  // Hide the panel entirely when transcripts aren't enabled and no transcript exists
  if (!transcriptsEnabled && !text && status === "not_requested") {
    return null;
  }

  const copy = statusCopy[status];
  const canGenerate = canManageTranscript && data?.transcriptsEnabled && status === "not_requested" && data.videoStatus === "ready";
  const canRetry = canManageTranscript && data?.transcriptsEnabled && status === "failed" && data.videoStatus === "ready";

  return (
    <section className="rounded-xl border border-border-default bg-bg-secondary p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{copy.title}</h2>
          {copy.body && <p className="mt-1 text-xs text-text-tertiary">{copy.body}</p>}
        </div>
        {!isFinalStatus(status) && (
          <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-warning" />
        )}
      </div>

      {error && <div className="mt-3 rounded-lg bg-accent-danger/15 px-3 py-2 text-xs text-accent-danger">{error}</div>}
      {status === "failed" && data?.transcript?.errorMessage && (
        <div className="mt-3 rounded-lg bg-accent-danger/15 px-3 py-2 text-xs text-accent-danger">
          {data.transcript.errorMessage}
        </div>
      )}

      {canGenerate && (
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="mt-4 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {generating ? "Starting..." : "Generate transcript"}
        </button>
      )}

      {canRetry && (
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="mt-4 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-50"
        >
          {generating ? "Retrying..." : "Retry transcript"}
        </button>
      )}

      {text && (status === "ready" || status === "ready_raw_only") && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            {copied ? "Copied!" : "Copy transcript"}
          </button>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const slug = videoTitle
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "");
              a.href = url;
              a.download = `${slug || "transcript"}-transcript.txt`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
            className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            Download .txt
          </button>
        </div>
      )}

      {text && (
        <div className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-border-default bg-bg-input p-4 text-sm leading-6 text-text-secondary">
          {text}
        </div>
      )}
    </section>
  );
}
