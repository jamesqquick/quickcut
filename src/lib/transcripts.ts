import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { transcripts, users, videos } from "../db/schema";
import { isTranscriptGenerationEnabled } from "./flags";

export type { TranscriptStatus } from "./transcript-status";

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

  const workflow = env.TRANSCRIPT_WORKFLOW;
  if (!workflow) return;

  try {
    await workflow.create({
      id: workflowInstanceId,
      params: { transcriptId, videoId: video.id } satisfies TranscriptWorkflowParams,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicate = message.includes("already exists") || message.includes("duplicate");

    if (isDuplicate) {
      // Duplicate webhook deliveries can race workflow creation. The existing
      // workflow will pick up the queued row.
      console.warn("Transcript workflow instance already exists:", workflowInstanceId);
    } else {
      // Non-duplicate failure means the workflow service is down or misconfigured.
      // Mark transcript as failed so the user can retry later.
      console.error("Transcript workflow creation failed:", error);
      await db
        .update(transcripts)
        .set({
          status: "failed",
          errorMessage: `Workflow creation failed: ${message}`,
          updatedAt: now,
        })
        .where(eq(transcripts.id, transcriptId));
    }
  }
}
