import { DurableObject } from "cloudflare:workers";

/**
 * Lightweight payload broadcast to the user's connected clients when a
 * new notification (comment, approval request, or pending space invite)
 * is created. The header badge only needs a signal to increment, but we
 * include identifying fields so future consumers (toasts, the
 * /notifications page) can react without an extra fetch.
 */
export interface BroadcastUserNotification {
	/** Distinguishes a regular notification row from a pending space invite. */
	kind: "notification" | "invite";
	/** notifications.id for kind="notification", spaceInvites.id for kind="invite". */
	id: string;
	/** Notification type (e.g. comment.created, approval.requested) when kind="notification". */
	type?: string;
	title: string;
	href: string;
	createdAt: string;
}

/**
 * Broadcast envelope for "these notifications were just marked read"
 * fan-out. Sent to every connected tab so the badge count and any
 * /notifications view can update without refetching.
 */
export interface BroadcastNotificationsRead {
	ids: string[];
}

type ServerMessage =
	| { type: "notification.new"; notification: BroadcastUserNotification }
	| { type: "notification.read.bulk"; ids: string[] };

/**
 * UserNotifications coordinates real-time delivery of badge-count signals
 * to a single user's open browser tabs.
 *
 * One Durable Object instance per userId (deterministic via getByName).
 * Uses hibernatable WebSockets so an idle user costs nothing while their
 * tabs are open but quiet.
 *
 * D1 remains the source of truth; this DO exists purely so the API write
 * paths can fan out to currently-connected tabs after a successful insert.
 * If broadcasts fail or the channel is severed, the next page load picks
 * up the correct count from the SSR'd value.
 */
export class UserNotifications extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Cheap ping/pong handled by the runtime so client heartbeats never
		// wake a hibernating DO.
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	/**
	 * Handle the WebSocket upgrade. The route handler authenticates the
	 * user, then forwards the upgrade Request to this DO, which accepts
	 * the socket and registers it for hibernation.
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
	 * RPC method called by API routes after a notification (or pending
	 * space invite) has been persisted for this user. Pushes a
	 * notification.new message to every currently connected tab.
	 */
	async broadcastNotification(
		notification: BroadcastUserNotification,
	): Promise<void> {
		const message: ServerMessage = { type: "notification.new", notification };
		this.send(message);
	}

	/**
	 * RPC method called after a bulk mark-read (e.g. user opened the tab
	 * containing the referenced content). Fans out the affected
	 * notification ids so other open tabs can decrement their badge and
	 * update any /notifications view in place.
	 */
	async broadcastNotificationsRead(ids: string[]): Promise<void> {
		if (ids.length === 0) return;
		const message: ServerMessage = { type: "notification.read.bulk", ids };
		this.send(message);
	}

	private send(message: ServerMessage): void {
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

	// No client -> server messages needed. Drop anything we receive.
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
