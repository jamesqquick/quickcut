import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../../../db";
import { spaceInvites } from "../../../../../db/schema";
import { verifySpaceAccess } from "../../../../../lib/spaces";

export const GET: APIRoute = async ({ params, locals }) => {
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
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const invites = await db
    .select()
    .from(spaceInvites)
    .where(
      and(eq(spaceInvites.spaceId, spaceId), eq(spaceInvites.status, "pending")),
    );

  return new Response(JSON.stringify({ invites }), {
    headers: { "Content-Type": "application/json" },
  });
};
