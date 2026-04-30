import type {
	BroadcastApprovalStatus,
	BroadcastComment,
	BroadcastCommentReactions,
	BroadcastPhaseChange,
	Viewer,
} from "../durable-objects/VideoRoom";

export type { Viewer, BroadcastApprovalStatus, BroadcastCommentReactions, BroadcastPhaseChange } from "../durable-objects/VideoRoom";

type ServerMessage =
	| { type: "comment.new"; comment: BroadcastComment }
	| { type: "presence.sync"; viewers: Viewer[] }
	| { type: "approval.update"; approvalStatus: BroadcastApprovalStatus }
	| { type: "comment.reactions.update"; update: BroadcastCommentReactions }
	| { type: "phase.update"; phaseChange: BroadcastPhaseChange };

export interface VideoRoomHandlers {
	onComment?: (comment: BroadcastComment) => void;
	onPresence?: (viewers: Viewer[]) => void;
	onApproval?: (approvalStatus: BroadcastApprovalStatus) => void;
	onCommentReactions?: (update: BroadcastCommentReactions) => void;
	onPhaseChange?: (phaseChange: BroadcastPhaseChange) => void;
}

export interface VideoRoomConnection {
	disconnect: () => void;
}

interface ConnectOptions {
	/** Share-link token, if connecting as an anonymous viewer. */
	shareToken?: string;
	/** Viewer display name, used for presence indicators. */
	viewerName?: string;
	/** Viewer user ID (authenticated users only). */
	viewerUserId?: string;
}

/**
 * Open a hibernation-aware WebSocket to the per-video VideoRoom Durable
 * Object. Reconnects with capped exponential backoff. Returns a disconnect
 * handle that callers should invoke on unmount.
 */
export function connectVideoRoom(
	videoId: string,
	options: ConnectOptions,
	handlers: VideoRoomHandlers,
): VideoRoomConnection {
	let socket: WebSocket | null = null;
	let cancelled = false;
	let retry = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const buildUrl = () => {
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		const url = new URL(`${proto}//${window.location.host}/api/videos/${videoId}/live`);
		if (options.shareToken) {
			url.searchParams.set("t", options.shareToken);
		}
		if (options.viewerName) {
			url.searchParams.set("viewer_name", options.viewerName);
		}
		if (options.viewerUserId) {
			url.searchParams.set("viewer_id", options.viewerUserId);
		}
		return url.toString();
	};

	const open = () => {
		if (cancelled) return;
		try {
			socket = new WebSocket(buildUrl());
		} catch {
			scheduleReconnect();
			return;
		}

		socket.addEventListener("open", () => {
			retry = 0;
		});

		socket.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return;
			let parsed: ServerMessage | null = null;
			try {
				parsed = JSON.parse(event.data) as ServerMessage;
			} catch {
				return;
			}
			if (parsed.type === "comment.new") {
				handlers.onComment?.(parsed.comment);
			} else if (parsed.type === "presence.sync") {
				handlers.onPresence?.(parsed.viewers);
			} else if (parsed.type === "approval.update") {
				handlers.onApproval?.(parsed.approvalStatus);
			} else if (parsed.type === "comment.reactions.update") {
				handlers.onCommentReactions?.(parsed.update);
			} else if (parsed.type === "phase.update") {
				handlers.onPhaseChange?.(parsed.phaseChange);
			}
		});

		socket.addEventListener("close", () => {
			if (!cancelled) scheduleReconnect();
		});

		socket.addEventListener("error", () => {
			// Let close handler drive reconnection.
			try {
				socket?.close();
			} catch {
				// ignore
			}
		});
	};

	const scheduleReconnect = () => {
		if (cancelled) return;
		const delay = Math.min(1000 * 2 ** retry, 15_000);
		retry += 1;
		reconnectTimer = setTimeout(open, delay);
	};

	open();

	return {
		disconnect() {
			cancelled = true;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (socket) {
				try {
					socket.close();
				} catch {
					// ignore
				}
			}
		},
	};
}
