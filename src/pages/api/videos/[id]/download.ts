import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { getMergedVideoById } from "../../../../lib/projects";
import { verifySpaceAccess } from "../../../../lib/spaces";
import { createVideoDownloadResponse } from "../../../../lib/video-download";

const handleDownload: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) {
    return Response.json({ error: "Please sign in to download this video." }, { status: 401 });
  }
  if (!params.id) {
    return Response.json({ error: "Video ID required." }, { status: 400 });
  }

  try {
    const db = createDb(env.DB);
    const video = await getMergedVideoById(db, params.id);
    if (!video) {
      return Response.json({ error: "Video not found." }, { status: 404 });
    }
    const role = await verifySpaceAccess(db, locals.user.id, video.spaceId);
    if (!role) {
      return Response.json({ error: "You don't have access to this video." }, { status: 403 });
    }
    return await createVideoDownloadResponse(env, video, request.method === "POST");
  } catch (error) {
    console.error("[videoDownload] failed:", error);
    return Response.json({ error: "We couldn't prepare the download. Please try again." }, { status: 500 });
  }
};

export const POST = handleDownload;
export const GET = handleDownload;
