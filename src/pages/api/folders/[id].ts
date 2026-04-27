import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "../../../db";
import { folders, videos } from "../../../db/schema";
import { folderUpdateSchema } from "../../../lib/validation";
import { verifySpaceAccess } from "../../../lib/spaces";

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Folder ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = folderUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const current = await db
    .select()
    .from(folders)
    .where(eq(folders.id, id))
    .limit(1);

  if (current.length === 0) {
    return new Response(JSON.stringify({ error: "Folder not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify user has space access
  const patchRole = await verifySpaceAccess(db, locals.user.id, current[0].spaceId);
  if (!patchRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const updates: { name?: string; parentId?: string | null; updatedAt: string } = {
    updatedAt: new Date().toISOString(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.parentId !== undefined) {
    const parentId = parsed.data.parentId ?? null;
    if (parentId === id) {
      return new Response(JSON.stringify({ error: "A folder cannot contain itself" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (parentId) {
      const allFolders = await db
        .select({ id: folders.id, parentId: folders.parentId })
        .from(folders)
        .where(eq(folders.spaceId, current[0].spaceId));
      const folderById = new Map(allFolders.map((folder) => [folder.id, folder]));
      let cursor = folderById.get(parentId);

      while (cursor) {
        if (cursor.id === id) {
          return new Response(JSON.stringify({ error: "Cannot move a folder into its own child" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
      }

      if (!folderById.has(parentId)) {
        return new Response(JSON.stringify({ error: "Parent folder not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    updates.parentId = parentId;
  }

  await db.update(folders).set(updates).where(eq(folders.id, id));
  const updated = await db.select().from(folders).where(eq(folders.id, id)).limit(1);

  return new Response(JSON.stringify({ folder: updated[0] }), {
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
    return new Response(JSON.stringify({ error: "Folder ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb(env.DB);
  const current = await db
    .select({ id: folders.id, spaceId: folders.spaceId })
    .from(folders)
    .where(eq(folders.id, id))
    .limit(1);

  if (current.length === 0) {
    return new Response(JSON.stringify({ error: "Folder not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify user has space access
  const deleteRole = await verifySpaceAccess(db, locals.user.id, current[0].spaceId);
  if (!deleteRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const allFolders = await db
    .select({ id: folders.id, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.spaceId, current[0].spaceId));
  const idsToDelete = new Set([id]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of allFolders) {
      if (folder.parentId && idsToDelete.has(folder.parentId) && !idsToDelete.has(folder.id)) {
        idsToDelete.add(folder.id);
        changed = true;
      }
    }
  }

  const ids = Array.from(idsToDelete);
  await db.update(videos).set({ folderId: null, updatedAt: new Date().toISOString() }).where(inArray(videos.folderId, ids));
  await db.delete(folders).where(inArray(folders.id, ids));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
