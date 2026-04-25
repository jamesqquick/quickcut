import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { reviewStatusSchema } from "../../../../lib/validation";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = reviewStatusSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid review status", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  const videoResult = await db
    .select({ id: videos.id, userId: videos.userId })
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

  await db
    .update(videos)
    .set({
      reviewStatus: parsed.data.reviewStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(videos.id, id));

  return new Response(
    JSON.stringify({ reviewStatus: parsed.data.reviewStatus }),
    { headers: { "Content-Type": "application/json" } },
  );
};
