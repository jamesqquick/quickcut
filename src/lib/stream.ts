const STREAM_API_BASE = "https://api.cloudflare.com/client/v4/accounts";

const STREAM_FETCH_TIMEOUT_MS = 15_000;
const STREAM_FETCH_MAX_ATTEMPTS = 3;
const STREAM_FETCH_BACKOFF_MS = 500;

async function streamFetch(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= STREAM_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(STREAM_FETCH_TIMEOUT_MS),
      });

      if (response.status >= 500 && attempt < STREAM_FETCH_MAX_ATTEMPTS) {
        console.warn(
          `Stream API ${response.status} (attempt ${attempt}/${STREAM_FETCH_MAX_ATTEMPTS}); retrying`,
        );
        await sleep(STREAM_FETCH_BACKOFF_MS * attempt);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < STREAM_FETCH_MAX_ATTEMPTS) {
        console.warn(
          `Stream API fetch failed (attempt ${attempt}/${STREAM_FETCH_MAX_ATTEMPTS}); retrying`,
          err,
        );
        await sleep(STREAM_FETCH_BACKOFF_MS * attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Stream API fetch failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DirectUploadResult {
  uploadUrl: string;
  streamVideoId: string;
}

export async function createDirectUpload(
  accountId: string,
  apiToken: string,
  fileName: string,
  fileSize: number,
): Promise<DirectUploadResult> {
  const response = await streamFetch(
    `${STREAM_API_BASE}/${accountId}/stream?direct_user=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(fileSize),
        "Upload-Metadata": `name ${btoa(fileName)}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Stream API error: ${response.status} ${response.statusText}`);
  }

  const streamVideoId = response.headers.get("stream-media-id");
  const uploadUrl = response.headers.get("Location");

  if (!streamVideoId || !uploadUrl) {
    throw new Error("Missing stream-media-id or Location header from Stream API");
  }

  return { uploadUrl, streamVideoId };
}

interface StreamVideoInfo {
  uid: string;
  status: { state: string };
  duration: number;
  thumbnail: string;
  playback: { hls: string; dash: string };
  readyToStream: boolean;
}

export async function getVideoInfo(
  accountId: string,
  apiToken: string,
  streamVideoId: string,
): Promise<StreamVideoInfo> {
  const response = await streamFetch(
    `${STREAM_API_BASE}/${accountId}/stream/${streamVideoId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Stream API error: ${response.status}`);
  }

  const data = (await response.json()) as { result: StreamVideoInfo };
  return data.result;
}

export async function deleteVideo(
  accountId: string,
  apiToken: string,
  streamVideoId: string,
): Promise<void> {
  const response = await streamFetch(
    `${STREAM_API_BASE}/${accountId}/stream/${streamVideoId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  // Treat 404 as already-deleted (idempotent success)
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Stream API error: ${response.status} ${response.statusText}`,
    );
  }
}

export interface StreamAudioDownload {
  status: "inprogress" | "ready" | "error" | string;
  url: string | null;
  percentComplete?: number;
}

interface StreamDownloadsResponse {
  result?: {
    audio?: StreamAudioDownload;
  };
}

export async function requestAudioDownload(
  accountId: string,
  apiToken: string,
  streamVideoId: string,
): Promise<StreamAudioDownload> {
  const response = await streamFetch(
    `${STREAM_API_BASE}/${accountId}/stream/${streamVideoId}/downloads/audio`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  // Tolerate 409 Conflict -- audio download was already requested.
  // Fall back to checking download status via the GET endpoint.
  if (response.status === 409) {
    const existing = await getAudioDownload(accountId, apiToken, streamVideoId);
    if (existing) return existing;
    // If GET also returns nothing, the 409 is unexpected -- throw.
    throw new Error("Stream returned 409 but no existing audio download found");
  }

  if (!response.ok) {
    throw new Error(`Stream audio download request failed: ${response.status}`);
  }

  const data = (await response.json()) as StreamDownloadsResponse;
  if (!data.result?.audio) throw new Error("Stream response did not include audio download details");
  return data.result.audio;
}

export async function getAudioDownload(
  accountId: string,
  apiToken: string,
  streamVideoId: string,
): Promise<StreamAudioDownload | null> {
  const response = await streamFetch(
    `${STREAM_API_BASE}/${accountId}/stream/${streamVideoId}/downloads`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Stream downloads lookup failed: ${response.status}`);
  }

  const data = (await response.json()) as StreamDownloadsResponse;
  return data.result?.audio || null;
}
