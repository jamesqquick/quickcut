import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, videos } from "../../../../db/schema";
import { eq } from "drizzle-orm";
import { generateShareToken } from "../../../../lib/share";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { videoId } = params;
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify ownership
  const video = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (video.length === 0 || video[0].userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, videoId))
    .limit(1);

  return new Response(
    JSON.stringify({ shareLink: result[0] || null }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { videoId } = params;
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify ownership
  const video = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (video.length === 0 || video[0].userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Delete existing share link (regenerate)
  await db.delete(shareLinks).where(eq(shareLinks.videoId, videoId));

  // Create new share link
  const shareLinkId = crypto.randomUUID();
  const token = generateShareToken();

  await db.insert(shareLinks).values({
    id: shareLinkId,
    videoId,
    token,
    status: "active",
    viewCount: 0,
  });

  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.id, shareLinkId))
    .limit(1);

  return new Response(
    JSON.stringify({ shareLink: result[0] }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
};

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { videoId } = params;
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { status } = body;

  if (!["active", "revoked"].includes(status)) {
    return new Response(
      JSON.stringify({ error: "Status must be 'active' or 'revoked'" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  // Verify ownership
  const video = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (video.length === 0 || video[0].userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db
    .update(shareLinks)
    .set({ status })
    .where(eq(shareLinks.videoId, videoId));

  const result = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, videoId))
    .limit(1);

  return new Response(
    JSON.stringify({ shareLink: result[0] }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { videoId } = params;
  if (!videoId) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify ownership
  const video = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (video.length === 0 || video[0].userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.delete(shareLinks).where(eq(shareLinks.videoId, videoId));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
