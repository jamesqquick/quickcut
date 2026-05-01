import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks, videos, comments, users } from "../../../../db/schema";
import { eq, asc } from "drizzle-orm";

export const GET: APIRoute = async ({ params }) => {
  const { token } = params;
  if (!token) {
    return new Response(JSON.stringify({ error: "Token required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  // Find share link by token
  const shareLinkResult = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (shareLinkResult.length === 0) {
    return new Response(JSON.stringify({ error: "Link not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shareLink = shareLinkResult[0];

  if (shareLink.status === "revoked") {
    return new Response(
      JSON.stringify({ error: "This link has been revoked", revoked: true }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Get video
  const videoResult = await db
    .select()
    .from(videos)
    .where(eq(videos.id, shareLink.videoId))
    .limit(1);

  if (videoResult.length === 0) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get comments
  const allComments = await db
    .select()
    .from(comments)
    .where(eq(comments.videoId, shareLink.videoId))
    .orderBy(asc(comments.timestamp), asc(comments.createdAt));

  // Resolve display names
  const userIds = [
    ...new Set(
      allComments.filter((c) => c.authorUserId).map((c) => c.authorUserId!),
    ),
  ];
  let userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const usersResult = await db
      .select({ id: users.id, name: users.name })
      .from(users);
    userMap = Object.fromEntries(usersResult.map((u) => [u.id, u.name]));
  }

  const commentsWithNames = allComments.map((c) => ({
    ...c,
    name:
      c.authorType === "user" && c.authorUserId
        ? userMap[c.authorUserId] || "Unknown"
        : c.authorDisplayName || "Anonymous",
  }));

  return new Response(
    JSON.stringify({
      video: videoResult[0],
      comments: commentsWithNames,
      shareLink,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
