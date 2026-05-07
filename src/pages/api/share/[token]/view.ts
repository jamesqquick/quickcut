import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks } from "../../../../db/schema";
import { eq, and, sql } from "drizzle-orm";

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export const POST: APIRoute = async ({ params, request }) => {
  const { token } = params;
  if (!token) {
    return new Response(null, { status: 400 });
  }

  const ip = getClientIp(request);
  const { success } = await env.SHARE_VIEW_RATE_LIMITER.limit({
    key: `share-view:${token}:${ip}`,
  });
  if (!success) {
    return new Response(null, { status: 429 });
  }

  const db = createDb(env.DB);

  const result = await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
    })
    .where(and(eq(shareLinks.token, token), eq(shareLinks.status, "active")));

  if (result.meta.changes === 0) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, { status: 204 });
};
