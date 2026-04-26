import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { videos, shareLinks, comments, folders } from "../../../../db/schema";
import { and, eq, count } from "drizzle-orm";
import { deleteVideo as deleteStreamVideo } from "../../../../lib/stream";
import { videoUpdateSchema } from "../../../../lib/validation";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const video = videoResult[0];

  // Only owner can view
  if (video.userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get share link
  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.videoId, id))
    .limit(1);

  // Get comment count
  const commentCountResult = await db
    .select({ count: count() })
    .from(comments)
    .where(eq(comments.videoId, id));

  return new Response(
    JSON.stringify({
      video,
      shareLink: shareLinkResult[0] || null,
      commentCount: commentCountResult[0]?.count || 0,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify ownership
  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (videoResult[0].userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = videoUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: { title?: string; description?: string; folderId?: string | null } = {};

  if (parsed.data.title !== undefined) updates.title = parsed.data.title.trim();
  if (parsed.data.description !== undefined) updates.description = parsed.data.description.trim();
  if (parsed.data.folderId !== undefined) {
    const folderId = parsed.data.folderId ?? null;

    if (folderId) {
      const folder = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.userId, locals.user.id)))
        .limit(1);

      if (folder.length === 0) {
        return new Response(JSON.stringify({ error: "Folder not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    updates.folderId = folderId;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: "No updates provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db
    .update(videos)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(videos.id, id));

  const updated = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  return new Response(JSON.stringify({ video: updated[0] }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Video ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Verify ownership
  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, id))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const video = videoResult[0];

  if (video.userId !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Best-effort delete from Cloudflare Stream. Don't block DB cleanup if it fails.
  if (video.streamVideoId) {
    try {
      await deleteStreamVideo(
        env.STREAM_ACCOUNT_ID,
        env.STREAM_API_TOKEN,
        video.streamVideoId,
      );
    } catch (err) {
      console.error("Failed to delete video from Cloudflare Stream:", err);
    }
  }

  // Delete the video row. share_links and comments cascade via FK constraints.
  await db.delete(videos).where(eq(videos.id, id));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
