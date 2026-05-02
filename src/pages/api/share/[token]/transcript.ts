import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { shareLinks, transcripts, videos } from "../../../../db/schema";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const { token } = params;
  if (!token) return json({ error: "Token required" }, 400);

  const db = createDb(env.DB);

  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (shareLinkResult.length === 0 || shareLinkResult[0].status === "revoked") {
    return json({ error: "Link not available" }, 403);
  }

  const videoId = shareLinkResult[0].videoId;

  const videoResult = await db
    .select({ status: videos.status, transcriptRequested: videos.transcriptRequested })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);

  if (videoResult.length === 0) return json({ error: "Video not found" }, 404);

  const transcriptResult = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, videoId))
    .limit(1);

  const transcript = transcriptResult[0] || null;

  return json({
    transcript,
    transcriptRequested: videoResult[0].transcriptRequested,
    // Guests cannot trigger generation, so this is always false for them
    transcriptsEnabled: false,
    videoStatus: videoResult[0].status,
  });
};
