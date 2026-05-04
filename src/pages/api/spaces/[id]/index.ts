import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq, count } from "drizzle-orm";
import { createDb } from "../../../../db";
import { spaces, spaceMembers } from "../../../../db/schema";
import { verifySpaceAccess } from "../../../../lib/spaces";

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Space ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, id);
  if (!role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const space = await db
    .select()
    .from(spaces)
    .where(eq(spaces.id, id))
    .limit(1);

  if (space.length === 0) {
    return new Response(JSON.stringify({ error: "Space not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberCount = await db
    .select({ count: count() })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, id));

  return new Response(
    JSON.stringify({
      space: {
        ...space[0],
        memberCount: memberCount[0]?.count ?? 0,
        role,
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
