import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../../../db";
import { spaceMembers } from "../../../../../../db/schema";
import { verifySpaceAccess } from "../../../../../../lib/spaces";

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: spaceId, userId: targetUserId } = params;
  if (!spaceId || !targetUserId) {
    return new Response(JSON.stringify({ error: "Space ID and user ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (targetUserId === locals.user.id) {
    return new Response(
      JSON.stringify({ error: "Cannot remove yourself. Use leave instead." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const member = await db
    .select({ id: spaceMembers.id })
    .from(spaceMembers)
    .where(
      and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetUserId)),
    )
    .limit(1);

  if (member.length === 0) {
    return new Response(JSON.stringify({ error: "Member not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db
    .delete(spaceMembers)
    .where(
      and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, targetUserId)),
    );

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
