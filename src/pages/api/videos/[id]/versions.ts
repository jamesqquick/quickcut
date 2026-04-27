import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { createDb } from "../../../../db";
import { comments, videos } from "../../../../db/schema";
import { createDirectUpload } from "../../../../lib/stream";
import { uploadSchema } from "../../../../lib/validation";
import { isTranscriptGenerationEnabled } from "../../../../lib/flags";
import { verifySpaceAccess } from "../../../../lib/spaces";

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"];
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const db = createDb(env.DB);
  const videoResult = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const video = videoResult[0];

  if (!video) return json({ error: "Video not found" }, 404);

  const getRole = await verifySpaceAccess(db, locals.user.id, video.spaceId);
  if (!getRole) return json({ error: "Forbidden" }, 403);

  const versionGroupId = video.versionGroupId || video.id;
  const versionRows = await db
    .select()
    .from(videos)
    .where(and(eq(videos.spaceId, video.spaceId), eq(videos.versionGroupId, versionGroupId)))
    .orderBy(desc(videos.versionNumber));

  const versionIds = versionRows.map((version) => version.id);
  let commentCounts: Record<string, number> = {};

  if (versionIds.length > 0) {
    const counts = await db
      .select({ videoId: comments.videoId, count: count() })
      .from(comments)
      .where(sql`${comments.videoId} IN (${sql.join(versionIds.map((versionId) => sql`${versionId}`), sql`, `)})`)
      .groupBy(comments.videoId);

    commentCounts = Object.fromEntries(counts.map((row) => [row.videoId, row.count]));
  }

  return json({
    versions: versionRows.map((version) => ({
      id: version.id,
      title: version.title,
      status: version.status,
      thumbnailUrl: version.thumbnailUrl,
      duration: version.duration,
      versionNumber: version.versionNumber,
      isCurrentVersion: version.isCurrentVersion,
      createdAt: version.createdAt,
      commentCount: commentCounts[version.id] || 0,
    })),
  });
};

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { id } = params;
  if (!id) return json({ error: "Video ID required" }, 400);

  const parsed = uploadSchema.omit({ folderId: true }).safeParse(await request.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message || "Invalid input" }, 400);
  }

  const { fileName, fileSize, title, description, generateTranscript } = parsed.data;
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return json({ error: "Unsupported file type. Please upload MP4, MOV, WebM, AVI, or MKV." }, 400);
  }

  if (fileSize > MAX_FILE_SIZE) {
    return json({ error: "File exceeds the 5GB limit." }, 400);
  }

  const db = createDb(env.DB);
  const baseResult = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  const baseVideo = baseResult[0];

  if (!baseVideo) return json({ error: "Video not found" }, 404);

  const postRole = await verifySpaceAccess(db, locals.user.id, baseVideo.spaceId);
  if (!postRole) return json({ error: "Forbidden" }, 403);

  const versionGroupId = baseVideo.versionGroupId || baseVideo.id;
  const latestResult = await db
    .select({ versionNumber: videos.versionNumber })
    .from(videos)
    .where(and(eq(videos.spaceId, baseVideo.spaceId), eq(videos.versionGroupId, versionGroupId)))
    .orderBy(desc(videos.versionNumber))
    .limit(1);

  const nextVersionNumber = (latestResult[0]?.versionNumber || 1) + 1;

  try {
    const { uploadUrl, streamVideoId } = await createDirectUpload(
      env.STREAM_ACCOUNT_ID,
      env.STREAM_API_TOKEN,
      fileName,
      fileSize,
    );

    const videoId = crypto.randomUUID();
    const now = new Date().toISOString();
    const transcriptRequested = generateTranscript
      ? await isTranscriptGenerationEnabled(env, locals.user)
      : false;

    await db
      .update(videos)
      .set({ isCurrentVersion: false, updatedAt: now })
      .where(and(eq(videos.spaceId, baseVideo.spaceId), eq(videos.versionGroupId, versionGroupId)));

    await db.insert(videos).values({
      id: videoId,
      spaceId: baseVideo.spaceId,
      uploadedBy: locals.user.id,
      folderId: baseVideo.folderId,
      title: title?.trim() || baseVideo.title,
      description: description !== undefined ? description.trim() || null : baseVideo.description,
      status: "processing",
      versionGroupId,
      versionNumber: nextVersionNumber,
      isCurrentVersion: true,
      streamVideoId,
      fileName,
      fileSize,
      transcriptRequested,
      createdAt: now,
      updatedAt: now,
    });

    return json({ videoId, uploadUrl });
  } catch (error) {
    console.error("Version upload error:", error);
    return json({ error: "Upload service is temporarily unavailable. Please try again." }, 500);
  }
};
