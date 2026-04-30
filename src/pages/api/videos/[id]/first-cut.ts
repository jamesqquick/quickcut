import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { videos } from "../../../../db/schema";
import { createDirectUpload } from "../../../../lib/stream";
import { isTranscriptGenerationEnabled } from "../../../../lib/flags";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { uploadSchema } from "../../../../lib/validation";
import { broadcastPhaseChange } from "../../../../lib/broadcast";
import { logProjectActivity } from "../../../../lib/activity";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const parsed = uploadSchema.omit({ spaceId: true, folderId: true }).safeParse(await request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message || "Invalid input" }, 400);
  }

  const { fileName, fileSize, generateTranscript } = parsed.data;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return json({ error: "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV." }, 400);
  }
  if (fileSize > MAX_FILE_SIZE) return json({ error: "File exceeds the 5GB limit." }, 400);

  const db = createDb(env.DB);
  const projectResult = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const project = projectResult[0];

  if (!project) return json({ error: "Project not found" }, 404);
  if (project.phase === "published") return json({ error: "Cannot upload to a published project" }, 403);
  if (project.status !== "draft" || project.streamVideoId) {
    return json({ error: "This project already has a video" }, 409);
  }

  const role = await verifySpaceAccess(db, locals.user.id, project.spaceId);
  if (!role) return json({ error: "Forbidden" }, 403);

  try {
    const { uploadUrl, streamVideoId } = await createDirectUpload(
      env.STREAM_ACCOUNT_ID,
      env.STREAM_API_TOKEN,
      fileName,
      fileSize,
    );

    const now = new Date().toISOString();
    const transcriptRequested = generateTranscript
      ? await isTranscriptGenerationEnabled(env, locals.user)
      : false;

    await db
      .update(videos)
      .set({
        uploadedBy: locals.user.id,
        status: "processing",
        phase: "reviewing_video",
        streamVideoId,
        fileName,
        fileSize,
        transcriptRequested,
        updatedAt: now,
      })
      .where(eq(videos.id, id));

    await logProjectActivity(db, {
      videoId: id,
      actorUserId: locals.user.id,
      actorDisplayName: locals.user.displayName,
      type: "first_cut.uploaded",
      data: { fileName, fileSize },
      createdAt: now,
    });

    await logProjectActivity(db, {
      videoId: id,
      actorUserId: locals.user.id,
      actorDisplayName: locals.user.displayName,
      type: "phase.changed",
      data: { from: project.phase, to: "reviewing_video" },
      createdAt: now,
    });

    await broadcastPhaseChange(env, id, {
      videoId: id,
      phase: "reviewing_video",
      changedBy: locals.user.displayName,
    });

    return json({ videoId: id, uploadUrl });
  } catch (error) {
    console.error("First-cut upload error:", error);
    return json({ error: "Upload service is temporarily unavailable. Please try again." }, 500);
  }
};
