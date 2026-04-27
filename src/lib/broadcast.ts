import type {
	BroadcastApprovalStatus,
	BroadcastComment,
} from "../durable-objects/VideoRoom";

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

/**
 * Best-effort fan-out of a recomputed approval status after an approval
 * is added or removed. Same hibernation semantics as the comment
 * broadcast — D1 is already authoritative; this just lets connected
 * viewers update their UI in real time.
 */
export async function broadcastApprovalUpdate(
	env: Env,
	videoId: string,
	approvalStatus: BroadcastApprovalStatus,
): Promise<void> {
	try {
		const stub = env.VIDEO_ROOM.getByName(videoId);
		await stub.broadcastApproval(approvalStatus);
	} catch (err) {
		console.error("VideoRoom approval broadcast failed", { videoId, err });
	}
}
