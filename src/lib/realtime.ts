import type { BroadcastComment } from "../durable-objects/VideoRoom";

interface ServerMessage {
	type: "comment.new";
	comment: BroadcastComment;
}

export interface VideoRoomHandlers {
	onComment?: (comment: BroadcastComment) => void;
}

export interface VideoRoomConnection {
	disconnect: () => void;
}

interface ConnectOptions {
	/** Share-link token, if connecting as an anonymous viewer. */
	shareToken?: string;
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
