import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { shareLinks } from "../../../../db/schema";
import { eq, sql } from "drizzle-orm";

export const POST: APIRoute = async ({ params }) => {
  const { token } = params;
  if (!token) {
    return new Response(null, { status: 400 });
  }

  const db = createDb(env.DB);

  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
    })
    .where(eq(shareLinks.token, token));

  return new Response(null, { status: 204 });
};
