import { useEffect, useRef, useState } from "react";

type TranscriptStatus =
  | "not_requested"
  | "requested"
  | "queued"
  | "exporting_audio"
  | "waiting_for_audio"
  | "transcribing"
  | "cleaning"
  | "ready"
  | "ready_raw_only"
  | "failed"
  | "skipped_feature_disabled";

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
    title: "Raw transcript ready",
    body: "Cleanup failed, so this is the raw speech-to-text output.",
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

function isFinalStatus(status: TranscriptStatus): boolean {
  return ["ready", "ready_raw_only", "failed", "skipped_feature_disabled", "not_requested"].includes(status);
}

export function TranscriptPanel({ videoId }: TranscriptPanelProps) {
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}/transcript`);
      if (!response.ok) throw new Error("Failed to load transcript");
      const next = (await response.json()) as TranscriptResponse;
      setData(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcript");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [videoId]);

  const status: TranscriptStatus = data?.transcript?.status ?? (data?.transcriptRequested ? "requested" : "not_requested");

  useEffect(() => {
    if (!data || isFinalStatus(status)) return;

    pollRef.current = setInterval(() => {
      void load();
    }, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [data, status, videoId]);

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

  const copy = statusCopy[status];
  const text = data?.transcript?.cleanedText || data?.transcript?.rawText || "";
  const canGenerate = data?.transcriptsEnabled && status === "not_requested" && data.videoStatus === "ready";

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

      {text && (
        <div className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-border-default bg-bg-input p-4 text-sm leading-6 text-text-secondary">
          {text}
        </div>
      )}
    </section>
  );
}
