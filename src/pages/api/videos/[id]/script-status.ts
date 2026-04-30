import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { scripts, videos } from "../../../../db/schema";
import { scriptStatusUpdateSchema } from "../../../../lib/validation";
import { verifySpaceAccess } from "../../../../lib/spaces";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const parsed = scriptStatusUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message || "Invalid script status" }, 400);

  const db = createDb(env.DB);
  const projectRows = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const project = projectRows[0];

  if (!project) return json({ error: "Project not found" }, 404);
  if (project.phase === "published") return json({ error: "Cannot update published scripts" }, 403);

  const role = await verifySpaceAccess(db, locals.user.id, project.spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  const now = new Date().toISOString();
  const existing = await db.select().from(scripts).where(eq(scripts.videoId, id)).limit(1);

  if (existing[0]) {
    await db.update(scripts).set({ status: parsed.data.status, updatedAt: now }).where(eq(scripts.videoId, id));
  } else {
    await db.insert(scripts).values({
      id: crypto.randomUUID(),
      videoId: id,
      content: "",
      plainText: "",
      status: parsed.data.status,
      createdBy: locals.user.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  const scriptRows = await db.select().from(scripts).where(eq(scripts.videoId, id)).limit(1);
  return json({ script: scriptRows[0] });
};
