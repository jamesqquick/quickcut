import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { transcripts, users, videos } from "../db/schema";
import { isTranscriptGenerationEnabled } from "./flags";

export type TranscriptStatus =
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

interface WorkflowBinding {
  create(options: { id?: string; params?: unknown }): Promise<{ id: string }>;
}

export interface TranscriptWorkflowParams {
  transcriptId: string;
  videoId: string;
}

export async function queueTranscriptForVideo(
  env: Env,
  db: Database,
  video: typeof videos.$inferSelect,
): Promise<void> {
  if (!video.transcriptRequested || video.status !== "ready") return;

  const existing = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, video.id))
    .limit(1);

  if (existing[0] && existing[0].status !== "failed") return;

  const userResult = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, video.userId))
    .limit(1);
  const user = userResult[0];
  if (!user) return;

  const enabled = await isTranscriptGenerationEnabled(env, user);
  const now = new Date().toISOString();
  const transcriptId = existing[0]?.id || crypto.randomUUID();

  if (!enabled) {
    if (existing[0]) {
      await db
        .update(transcripts)
        .set({ status: "skipped_feature_disabled", updatedAt: now })
        .where(eq(transcripts.id, transcriptId));
    } else {
      await db.insert(transcripts).values({
        id: transcriptId,
        videoId: video.id,
        userId: video.userId,
        status: "skipped_feature_disabled",
        requestedAt: now,
        updatedAt: now,
      });
    }
    return;
  }

  const workflowInstanceId = `transcript-${transcriptId}`;

  if (existing[0]) {
    await db
      .update(transcripts)
      .set({
        status: "queued",
        errorMessage: null,
        workflowInstanceId,
        updatedAt: now,
      })
      .where(eq(transcripts.id, transcriptId));
  } else {
    await db.insert(transcripts).values({
      id: transcriptId,
      videoId: video.id,
      userId: video.userId,
      status: "queued",
      workflowInstanceId,
      requestedAt: now,
      updatedAt: now,
    });
  }

  const workflow = (env as Env & { TRANSCRIPT_WORKFLOW?: WorkflowBinding }).TRANSCRIPT_WORKFLOW;
  if (!workflow) return;

  try {
    await workflow.create({
      id: workflowInstanceId,
      params: { transcriptId, videoId: video.id } satisfies TranscriptWorkflowParams,
    });
  } catch (error) {
    // Duplicate webhook deliveries can race workflow creation. If the row already
    // points at this instance, leave it queued and let the existing workflow run.
    console.warn("Transcript workflow was not created:", error);
  }
}
