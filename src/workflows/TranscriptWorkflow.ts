import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { transcripts, videos } from "../db/schema";
import { getAudioDownload, requestAudioDownload } from "../lib/stream";
import type { TranscriptWorkflowParams } from "../lib/transcripts";

interface WhisperResponse {
  text?: string;
  word_count?: number;
  vtt?: string;
}

interface TextGenerationResponse {
  response?: string;
}

function now() {
  return new Date().toISOString();
}

function getCleanupPrompt(rawText: string) {
  return [
    "Clean up this speech-to-text transcript for readability.",
    "Preserve the speaker's meaning. Do not add facts. Do not summarize.",
    "Fix obvious punctuation, casing, paragraph breaks, and repeated false starts.",
    "Return only the cleaned transcript text.",
    "",
    rawText,
  ].join("\n");
}

export class TranscriptWorkflow extends WorkflowEntrypoint<Env, TranscriptWorkflowParams> {
  async run(event: WorkflowEvent<TranscriptWorkflowParams>, step: WorkflowStep) {
    const { transcriptId, videoId } = event.payload;
    const db = createDb(this.env.DB);

    try {
      const video = await step.do("load video", async () => {
        const result = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
        if (!result[0]) throw new Error("Video not found");
        if (!result[0].streamVideoId) throw new Error("Video is missing Stream ID");
        return result[0];
      });

      await step.do("mark exporting audio", async () => {
        await db
          .update(transcripts)
          .set({ status: "exporting_audio", startedAt: now(), updatedAt: now() })
          .where(eq(transcripts.id, transcriptId));
      });

      await step.do("request audio download", async () => {
        await requestAudioDownload(
          this.env.STREAM_ACCOUNT_ID,
          this.env.STREAM_API_TOKEN,
          video.streamVideoId!,
        );
      });

      await step.do("mark waiting for audio", async () => {
        await db
          .update(transcripts)
          .set({ status: "waiting_for_audio", updatedAt: now() })
          .where(eq(transcripts.id, transcriptId));
      });

      const audioUrl = await step.do(
        "wait for audio download",
        { retries: { limit: 20, delay: "15 seconds", backoff: "linear" }, timeout: "2 minutes" },
        async () => {
          const audio = await getAudioDownload(
            this.env.STREAM_ACCOUNT_ID,
            this.env.STREAM_API_TOKEN,
            video.streamVideoId!,
          );

          if (!audio || audio.status === "inprogress") {
            throw new Error("Audio download is not ready yet");
          }
          if (audio.status !== "ready" || !audio.url) {
            throw new Error(`Audio download failed with status ${audio.status}`);
          }

          await db
            .update(transcripts)
            .set({ audioDownloadUrl: audio.url, updatedAt: now() })
            .where(eq(transcripts.id, transcriptId));

          return audio.url;
        },
      );

      const transcribed = await step.do(
        "transcribe audio",
        {
          timeout: "10 minutes",
          retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
        },
        async () => {
          await db
            .update(transcripts)
            .set({ status: "transcribing", updatedAt: now() })
            .where(eq(transcripts.id, transcriptId));

          const audioResponse = await fetch(audioUrl, {
            signal: AbortSignal.timeout(60_000),
          });
          if (!audioResponse.ok) throw new Error(`Audio fetch failed: ${audioResponse.status}`);

          const audioBuffer = await audioResponse.arrayBuffer();
          const audioBytes = new Uint8Array(audioBuffer);
          const response = await this.env.AI.run("@cf/openai/whisper", {
            audio: Array.from(audioBytes),
          }) as WhisperResponse;

          if (!response.text) throw new Error("Workers AI did not return transcript text");

          await db
            .update(transcripts)
            .set({
              rawText: response.text,
              vtt: response.vtt || null,
              wordCount: response.word_count || null,
              status: "ready_raw_only",
              updatedAt: now(),
            })
            .where(eq(transcripts.id, transcriptId));

          return { text: response.text };
        },
      );

      await step.do("mark cleaning", async () => {
        await db
          .update(transcripts)
          .set({ status: "cleaning", updatedAt: now() })
          .where(eq(transcripts.id, transcriptId));
      });

      let cleaned: string | null = null;
      let cleanupError: unknown = null;

      try {
        cleaned = await step.do(
          "clean transcript ai call",
          {
            timeout: "5 minutes",
            retries: { limit: 3, delay: "10 seconds" },
          },
          async () => {
            const response = (await this.env.AI.run(
              this.env.TRANSCRIPT_CLEANUP_MODEL,
              {
                messages: [{ role: "user", content: getCleanupPrompt(transcribed.text) }],
              },
            )) as TextGenerationResponse;

            return response.response?.trim() || null;
          },
        );
      } catch (err) {
        // Retries exhausted. Persist `ready_raw_only` in the next step rather
        // than failing the whole workflow — the raw transcript is still usable.
        cleanupError = err;
      }

      await step.do("persist cleaned transcript", async () => {
        if (cleaned) {
          await db
            .update(transcripts)
            .set({
              cleanedText: cleaned,
              status: "ready",
              completedAt: now(),
              updatedAt: now(),
            })
            .where(eq(transcripts.id, transcriptId));
          return;
        }

        await db
          .update(transcripts)
          .set({
            status: "ready_raw_only",
            errorMessage:
              cleanupError instanceof Error
                ? cleanupError.message
                : cleanupError
                ? "Transcript cleanup failed"
                : null,
            completedAt: now(),
            updatedAt: now(),
          })
          .where(eq(transcripts.id, transcriptId));
      });
    } catch (err) {
      await step.do("mark failed", async () => {
        await db
          .update(transcripts)
          .set({
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown workflow error",
            completedAt: now(),
            updatedAt: now(),
          })
          .where(eq(transcripts.id, transcriptId));
      });
      throw err;
    }
  }
}
