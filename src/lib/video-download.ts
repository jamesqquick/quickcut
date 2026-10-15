import type { MergedVideo } from "./projects";
import { getVideoDownload, getVideoInfo, requestVideoDownload } from "./stream";
import type { VideoDownloadResponse } from "../types";

export async function createVideoDownloadResponse(
  env: Pick<Cloudflare.Env, "STREAM_ACCOUNT_ID" | "STREAM_API_TOKEN">,
  video: Pick<MergedVideo, "streamVideoId" | "title" | "versionNumber">,
  prepare: boolean,
): Promise<Response> {
  if (!video.streamVideoId) {
    return Response.json({ error: "Upload a video before downloading it." }, { status: 409 });
  }

  let download = await getVideoDownload(env.STREAM_ACCOUNT_ID, env.STREAM_API_TOKEN, video.streamVideoId);
  if (prepare && (!download || download.status === "error")) {
    const info = await getVideoInfo(env.STREAM_ACCOUNT_ID, env.STREAM_API_TOKEN, video.streamVideoId);
    if (!info.readyToStream) {
      return Response.json({ error: "This video isn't ready to download yet. Please try again after processing." }, { status: 409 });
    }
    download = await requestVideoDownload(env.STREAM_ACCOUNT_ID, env.STREAM_API_TOKEN, video.streamVideoId);
  }
  if (!download) {
    return Response.json({ error: "Please select Download again to prepare the MP4." }, { status: 404 });
  }
  if (download.status !== "ready" && download.status !== "inprogress") {
    return Response.json({ error: "We couldn't prepare the download. Please try again." }, { status: 502 });
  }

  let url: string | null = null;
  if (download.status === "ready") {
    if (!download.url) {
      return Response.json({ error: "We couldn't prepare the download. Please try again." }, { status: 502 });
    }
    const downloadUrl = new URL(download.url);
    const versionSuffix = `-v${video.versionNumber}`;
    const title = video.title
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120 - versionSuffix.length);
    downloadUrl.searchParams.set("filename", `${title || "video"}${versionSuffix}`);
    url = downloadUrl.toString();
  }

  return Response.json({ status: download.status, url } satisfies VideoDownloadResponse, {
    status: download.status === "ready" ? 200 : 202,
    headers: { "Cache-Control": "no-store" },
  });
}
