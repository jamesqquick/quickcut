import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "../../../db";
import { folders, scripts, videos } from "../../../db/schema";
import { projectCreateSchema } from "../../../lib/validation";
import { verifySpaceAccess } from "../../../lib/spaces";
import { logProjectActivity } from "../../../lib/activity";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const parsed = projectCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message || "Invalid input" }, 400);
  }

  const { title, description, spaceId, folderId } = parsed.data;
  const db = createDb(env.DB);

  const role = await verifySpaceAccess(db, locals.user.id, spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  if (folderId) {
    const folder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.spaceId, spaceId)))
      .limit(1);

    if (folder.length === 0) return json({ error: "Folder not found" }, 404);
  }

  const videoId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(videos).values({
    id: videoId,
    spaceId,
    uploadedBy: locals.user.id,
    folderId: folderId || null,
    title,
    description: description || null,
    status: "draft",
    versionGroupId: videoId,
    versionNumber: 1,
    isCurrentVersion: true,
    phase: "creating_script",
    targetDate: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(scripts).values({
    id: crypto.randomUUID(),
    videoId,
    content: "",
    plainText: "",
    status: "writing",
    createdBy: locals.user.id,
    createdAt: now,
    updatedAt: now,
  });

  await logProjectActivity(db, {
    videoId,
    actorUserId: locals.user.id,
    actorDisplayName: locals.user.name,
    type: "project.created",
    data: { title },
    createdAt: now,
  });

  return json({ videoId }, 201);
};
