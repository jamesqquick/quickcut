import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "../../../db";
import { folders, videos } from "../../../db/schema";
import { folderCreateSchema } from "../../../lib/validation";

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const parentId = url.searchParams.get("parentId");

  const where = parentId
    ? parentId === "root"
      ? and(eq(folders.userId, locals.user.id), isNull(folders.parentId))
      : and(eq(folders.userId, locals.user.id), eq(folders.parentId, parentId))
    : eq(folders.userId, locals.user.id);

  const userFolders = await db.select().from(folders).where(where).orderBy(folders.name);
  const folderIds = userFolders.map((folder) => folder.id);

  let counts: Record<string, number> = {};
  let thumbnails: Record<string, string[]> = {};

  if (folderIds.length > 0) {
    const videoCounts = await db
      .select({ folderId: videos.folderId, count: count() })
      .from(videos)
      .where(and(eq(videos.userId, locals.user.id), inArray(videos.folderId, folderIds)))
      .groupBy(videos.folderId);

    counts = Object.fromEntries(
      videoCounts.map((row) => [row.folderId ?? "", row.count]),
    );

    const folderVideos = await db
      .select({ folderId: videos.folderId, thumbnailUrl: videos.thumbnailUrl })
      .from(videos)
      .where(and(eq(videos.userId, locals.user.id), inArray(videos.folderId, folderIds)));

    thumbnails = folderVideos.reduce<Record<string, string[]>>((acc, video) => {
      if (!video.folderId || !video.thumbnailUrl) return acc;
      acc[video.folderId] = acc[video.folderId] || [];
      if (acc[video.folderId].length < 4) acc[video.folderId].push(video.thumbnailUrl);
      return acc;
    }, {});
  }

  return new Response(
    JSON.stringify({
      folders: userFolders.map((folder) => ({
        ...folder,
        videoCount: counts[folder.id] || 0,
        thumbnails: thumbnails[folder.id] || [],
      })),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = folderCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const parentId = parsed.data.parentId ?? null;

  if (parentId) {
    const parent = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.userId, locals.user.id)))
      .limit(1);

    if (parent.length === 0) {
      return new Response(JSON.stringify({ error: "Parent folder not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const id = crypto.randomUUID();
  await db.insert(folders).values({
    id,
    userId: locals.user.id,
    name: parsed.data.name,
    parentId,
  });

  const created = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return new Response(JSON.stringify({ folder: created[0] }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
