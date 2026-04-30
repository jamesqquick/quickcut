import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { phaseUpdateSchema } from "../../../../lib/validation";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { broadcastPhaseChange } from "../../../../lib/broadcast";
import { logProjectActivity } from "../../../../lib/activity";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const parsed = phaseUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message || "Invalid phase" }, 400);
  }

  const db = createDb(env.DB);

  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) return json({ error: "Video not found" }, 404);

  const video = videoResult[0];
  const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  const { phase } = parsed.data;

  // Publishing is the only status with behavior: it locks the project.
  if (
    (phase === "published" || video.phase === "published") &&
    role !== "owner" &&
    video.uploadedBy !== locals.user.id
  ) {
    return json({ error: "Only the space owner or video uploader can publish or unpublish" }, 403);
  }

  const now = new Date().toISOString();
  await db
    .update(videos)
    .set({ phase, updatedAt: now })
    .where(eq(videos.id, id));

  await logProjectActivity(db, {
    videoId: id,
    actorUserId: locals.user.id,
    actorDisplayName: locals.user.displayName,
    type: "phase.changed",
    data: { from: video.phase, to: phase },
    createdAt: now,
  });

  await broadcastPhaseChange(env, id, {
    videoId: id,
    phase,
    changedBy: locals.user.displayName,
  });

  const updated = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  return json({ video: updated[0] });
};
