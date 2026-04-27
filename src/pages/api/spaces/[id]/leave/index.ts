import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../../db";
import { spaceMembers } from "../../../../../db/schema";
import { verifySpaceAccess } from "../../../../../lib/spaces";

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: spaceId } = params;
  if (!spaceId) {
    return new Response(JSON.stringify({ error: "Space ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (!role) {
    return new Response(JSON.stringify({ error: "Not a member of this space" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (role === "owner") {
    return new Response(
      JSON.stringify({ error: "Owners cannot leave. Transfer ownership or delete the space." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  await db
    .delete(spaceMembers)
    .where(
      and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, locals.user.id)),
    );

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
