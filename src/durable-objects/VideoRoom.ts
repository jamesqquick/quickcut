import { DurableObject } from "cloudflare:workers";

/**
 * Shape of comments broadcast to connected clients.
 * Mirrors the API response shape in /api/videos/[id]/comments.ts and friends.
 */
export interface BroadcastComment {
	id: string;
	videoId: string;
	authorType: "user" | "anonymous";
	authorUserId: string | null;
	authorDisplayName: string | null;
	timestamp: number | null;
	text: string;
	parentId: string | null;
	isResolved: boolean;
	resolvedBy: string | null;
	resolvedAt: string | null;
	createdAt: string;
	displayName: string;
}

interface ServerMessage {
	type: "comment.new";
	comment: BroadcastComment;
}

/**
 * VideoRoom coordinates real-time updates for a single video review session.
 *
 * One Durable Object instance per videoId (deterministic via getByName).
 * Uses hibernatable WebSockets so an idle room costs nothing while reviewers
 * are connected but inactive.
 *
 * D1 remains the source of truth for comments; this DO is purely a fan-out
 * layer triggered by API write routes after a successful insert.
 */
export class VideoRoom extends DurableObject<Env> {
	/**
	 * Handle the WebSocket upgrade. The route handler forwards the upgrade
	 * Request to the DO, which accepts the socket and registers it for
	 * hibernation.
	 */
	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		if (upgradeHeader?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

		// Hibernatable acceptance: the runtime stores the socket and only wakes
		// the DO on incoming messages or when we call broadcast.
		this.ctx.acceptWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	/**
	 * RPC method called by API routes after a comment has been persisted.
	 * Pushes a comment.new message to every currently connected socket.
	 */
	async broadcastComment(comment: BroadcastComment): Promise<void> {
		const message: ServerMessage = { type: "comment.new", comment };
		const payload = JSON.stringify(message);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(payload);
			} catch {
				// Socket may have been closed between the snapshot and the send.
				// Ignore — the runtime will clean it up.
			}
		}
	}

	// Phase 1 has no client -> server messages. Drop anything we receive.
	async webSocketMessage(_ws: WebSocket, _message: ArrayBuffer | string): Promise<void> {
		// no-op
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		_reason: string,
		_wasClean: boolean,
	): Promise<void> {
		try {
			ws.close(code, "client closed");
		} catch {
			// ignore
		}
	}

	async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
		try {
			ws.close(1011, "internal error");
		} catch {
			// ignore
		}
	}
}
