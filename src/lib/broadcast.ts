import type { BroadcastComment } from "../durable-objects/VideoRoom";

/**
 * Best-effort fan-out of a freshly persisted comment to every viewer
 * connected to the per-video Durable Object room. Failures are swallowed:
 * the comment is already in D1, and clients still poll as a fallback.
 */
export async function broadcastNewComment(
	env: Env,
	videoId: string,
	comment: BroadcastComment,
): Promise<void> {
	try {
		const stub = env.VIDEO_ROOM.getByName(videoId);
		await stub.broadcastComment(comment);
	} catch (err) {
		console.error("VideoRoom broadcast failed", { videoId, err });
	}
}
