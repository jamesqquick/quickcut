import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { transcripts, videos } from "../../../../db/schema";
import { isTranscriptGenerationEnabled } from "../../../../lib/flags";
import { queueTranscriptForVideo } from "../../../../lib/transcripts";
import { verifySpaceAccess } from "../../../../lib/spaces";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const db = createDb(env.DB);
  const videoResult = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const video = videoResult[0];

  if (!video) return json({ error: "Video not found" }, 404);
  const getRole = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!getRole) return json({ error: "Forbidden" }, 403);

  const transcriptResult = await db.select().from(transcripts).where(eq(transcripts.videoId, id)).limit(1);
  const transcript = transcriptResult[0] || null;

  return json({
    transcript,
    transcriptRequested: video.transcriptRequested,
    transcriptsEnabled: await isTranscriptGenerationEnabled(env, locals.user),
    videoStatus: video.status,
  });
};

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const db = createDb(env.DB);
  const videoResult = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const video = videoResult[0];

  if (!video) return json({ error: "Video not found" }, 404);
  const postRole = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!postRole) return json({ error: "Forbidden" }, 403);

  const enabled = await isTranscriptGenerationEnabled(env, locals.user);
  if (!enabled) return json({ error: "Transcript generation is not enabled" }, 403);

  await db
    .update(videos)
    .set({ transcriptRequested: true, updatedAt: new Date().toISOString() })
    .where(eq(videos.id, id));

  const existingTranscript = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.videoId, id))
    .limit(1);

  if (!existingTranscript[0] && video.status !== "ready") {
    const now = new Date().toISOString();
    await db.insert(transcripts).values({
      id: crypto.randomUUID(),
      videoId: id,
      userId: locals.user.id,
      status: "requested",
      requestedAt: now,
      updatedAt: now,
    });
  }

  await queueTranscriptForVideo(env, db, { ...video, transcriptRequested: true });

  const transcriptResult = await db.select().from(transcripts).where(eq(transcripts.videoId, id)).limit(1);
  return json({ transcript: transcriptResult[0] || null }, 202);
};
