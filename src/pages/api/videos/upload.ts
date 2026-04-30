import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../db";
import { folders, videos } from "../../../db/schema";
import { createDirectUpload } from "../../../lib/stream";
import { and, eq } from "drizzle-orm";
import { uploadSchema } from "../../../lib/validation";
import { isTranscriptGenerationEnabled } from "../../../lib/flags";
import { getDefaultSpaceForUser, verifySpaceAccess } from "../../../lib/spaces";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = uploadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message || "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { fileName, fileSize, title, description, folderId, generateTranscript, spaceId } = parsed.data;

  if (!fileName || !fileSize) {
    return new Response(
      JSON.stringify({ error: "fileName and fileSize are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate extension
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return new Response(
      JSON.stringify({
        error: "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    return new Response(
      JSON.stringify({ error: "File exceeds the 5GB limit." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const { uploadUrl, streamVideoId } = await createDirectUpload(
      env.STREAM_ACCOUNT_ID,
      env.STREAM_API_TOKEN,
      fileName,
      fileSize,
    );

    const db = createDb(env.DB);
    const videoId = crypto.randomUUID();
    const videoTitle = title?.trim() || fileName.replace(/\.[^.]+$/, "");
    const transcriptRequested = generateTranscript
      ? await isTranscriptGenerationEnabled(env, locals.user)
      : false;

    const defaultSpace = spaceId ? null : await getDefaultSpaceForUser(db, locals.user.id);
    const targetSpaceId = spaceId ?? defaultSpace?.id;
    if (!targetSpaceId) {
      return new Response(JSON.stringify({ error: "No space found for user" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const role = await verifySpaceAccess(db, locals.user.id, targetSpaceId);
    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (folderId) {
      const folder = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, folderId), eq(folders.spaceId, targetSpaceId)))
        .limit(1);

      if (folder.length === 0) {
        return new Response(JSON.stringify({ error: "Folder not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    await db.insert(videos).values({
      id: videoId,
      spaceId: targetSpaceId,
      uploadedBy: locals.user.id,
      folderId: folderId || null,
      title: videoTitle,
      description: description?.trim() || null,
      status: "processing",
      versionGroupId: videoId,
      versionNumber: 1,
      isCurrentVersion: true,
      streamVideoId,
      fileName,
      fileSize,
      phase: "reviewing_video",
      transcriptRequested,
    });

    return new Response(
      JSON.stringify({ videoId, uploadUrl }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: "Upload service is temporarily unavailable. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
