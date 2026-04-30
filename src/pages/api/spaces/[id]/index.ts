import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq, count } from "drizzle-orm";
import { createDb } from "../../../../db";
import { spaces, spaceMembers } from "../../../../db/schema";
import { spaceUpdateSchema } from "../../../../lib/validation";
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

export const PATCH: APIRoute = async ({ params, locals, request }) => {
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

  const parsed = spaceUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, id);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: { name?: string; requiredApprovals?: number; pipelineEnabled?: boolean; updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.requiredApprovals !== undefined) updates.requiredApprovals = parsed.data.requiredApprovals;
  if (parsed.data.pipelineEnabled !== undefined) updates.pipelineEnabled = parsed.data.pipelineEnabled;

  await db.update(spaces).set(updates).where(eq(spaces.id, id));
  const updated = await db.select().from(spaces).where(eq(spaces.id, id)).limit(1);

  return new Response(JSON.stringify({ space: updated[0] }), {
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
    return new Response(JSON.stringify({ error: "Space ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, id);
  if (role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if this is the user's default personal space (first space they own)
  const space = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, id))
    .limit(1);

  if (space.length === 0) {
    return new Response(JSON.stringify({ error: "Space not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Find the user's earliest owned space (their "Personal" default space)
  const firstOwned = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.ownerId, locals.user.id))
    .orderBy(spaces.createdAt)
    .limit(1);

  if (firstOwned.length > 0 && firstOwned[0].id === id) {
    return new Response(
      JSON.stringify({ error: "Cannot delete your default personal space" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // CASCADE will handle space_members, space_invites, folders, videos
  await db.delete(spaces).where(eq(spaces.id, id));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
