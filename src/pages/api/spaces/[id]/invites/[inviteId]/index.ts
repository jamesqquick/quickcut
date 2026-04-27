import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../../../db";
import { spaceInvites } from "../../../../../../db/schema";
import { verifySpaceAccess } from "../../../../../../lib/spaces";

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: spaceId, inviteId } = params;
  if (!spaceId || !inviteId) {
    return new Response(JSON.stringify({ error: "Space ID and invite ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const invite = await db
    .select({ id: spaceInvites.id, status: spaceInvites.status })
    .from(spaceInvites)
    .where(
      and(eq(spaceInvites.id, inviteId), eq(spaceInvites.spaceId, spaceId)),
    )
    .limit(1);

  if (invite.length === 0) {
    return new Response(JSON.stringify({ error: "Invite not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (invite[0].status !== "pending") {
    return new Response(
      JSON.stringify({ error: "Only pending invites can be revoked" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  await db
    .update(spaceInvites)
    .set({ status: "revoked" })
    .where(eq(spaceInvites.id, inviteId));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
