import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../db";
import { shareLinks } from "../../../../db/schema";
import { getMergedVideoById } from "../../../../lib/projects";
import { createVideoDownloadResponse } from "../../../../lib/video-download";

const handleDownload: APIRoute = async ({ params, request }) => {
  if (!params.token) {
    return Response.json({ error: "Share link required." }, { status: 400 });
  }

  try {
    const db = createDb(env.DB);
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token)).limit(1);
    if (!link || link.status !== "active") {
      return Response.json({ error: "This share link is no longer available." }, { status: 403 });
    }
    const video = await getMergedVideoById(db, link.videoId);
    if (!video) {
      return Response.json({ error: "Video not found." }, { status: 404 });
    }

    return await createVideoDownloadResponse(env, video, request.method === "POST");
  } catch (error) {
    console.error("[shareVideoDownload] failed:", error);
    return Response.json({ error: "We couldn't prepare the download. Please try again." }, { status: 500 });
  }
};

export const POST = handleDownload;
export const GET = handleDownload;
