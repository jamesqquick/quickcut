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

    const audioUrl = await step.do(
      "wait for audio download",
      { retries: { limit: 20, delay: "15 seconds", backoff: "linear" }, timeout: "2 minutes" },
      async () => {
        await db
          .update(transcripts)
          .set({ status: "waiting_for_audio", updatedAt: now() })
          .where(eq(transcripts.id, transcriptId));

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

    const whisper = await step.do("transcribe audio", { timeout: "10 minutes" }, async () => {
      await db
        .update(transcripts)
        .set({ status: "transcribing", updatedAt: now() })
        .where(eq(transcripts.id, transcriptId));

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error(`Audio fetch failed: ${audioResponse.status}`);

      const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      const response = await this.env.AI.run("@cf/openai/whisper", {
        audio: [...audioBytes],
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

      return response;
    });

    await step.do("clean transcript", { timeout: "5 minutes" }, async () => {
      await db
        .update(transcripts)
        .set({ status: "cleaning", updatedAt: now() })
        .where(eq(transcripts.id, transcriptId));

      try {
        const response = await this.env.AI.run(this.env.TRANSCRIPT_CLEANUP_MODEL, {
          messages: [{ role: "user", content: getCleanupPrompt(whisper.text!) }],
        }) as TextGenerationResponse;

        const cleaned = response.response?.trim();
        await db
          .update(transcripts)
          .set({
            cleanedText: cleaned || null,
            status: cleaned ? "ready" : "ready_raw_only",
            completedAt: now(),
            updatedAt: now(),
          })
          .where(eq(transcripts.id, transcriptId));
      } catch (cleanupError) {
        // Cleanup failure is non-fatal -- raw transcript is still usable.
        await db
          .update(transcripts)
          .set({
            status: "ready_raw_only",
            errorMessage: cleanupError instanceof Error ? cleanupError.message : "Transcript cleanup failed",
            completedAt: now(),
            updatedAt: now(),
          })
          .where(eq(transcripts.id, transcriptId));
      }
    });
  }
}
