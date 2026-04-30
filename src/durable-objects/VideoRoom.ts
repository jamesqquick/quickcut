import { DurableObject } from "cloudflare:workers";
import type { Annotation, CommentReactionSummary, CommentUrgency, TextRange } from "../types";

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
	annotation: Annotation | null;
	urgency: CommentUrgency;
	phase: "script" | "review";
	textRange: TextRange | null;
	createdAt: string;
	displayName: string;
	reactions: CommentReactionSummary[];
}

export interface BroadcastCommentReactions {
	commentId: string;
	reactions: CommentReactionSummary[];
}

/**
 * Snapshot of a video's approval state, broadcast whenever a member
 * approves or un-approves the video. Mirrors `ApprovalStatus` in
 * src/lib/approvals.ts. Replicated here so the DO stays self-contained.
 */
export interface BroadcastApprovalStatus {
	requiredApprovals: number;
	currentApprovals: number;
	isApproved: boolean;
	approvals: Array<{
		id: string;
		userId: string;
		displayName: string;
		comment: string | null;
		createdAt: string;
	}>;
}

/**
 * Snapshot of a video's phase change, broadcast when a member moves the
 * video to a different pipeline phase.
 */
export interface BroadcastPhaseChange {
	videoId: string;
	phase: string;
	changedBy: string;
}

/** A viewer currently connected to the room. */
export interface Viewer {
	name: string;
	userId: string | null;
}

/** Attachment stored on each hibernatable WebSocket. */
interface SocketMeta {
	viewer: Viewer;
}

type ServerMessage =
	| { type: "comment.new"; comment: BroadcastComment }
	| { type: "presence.sync"; viewers: Viewer[] }
	| { type: "approval.update"; approvalStatus: BroadcastApprovalStatus }
	| { type: "comment.reactions.update"; update: BroadcastCommentReactions }
	| { type: "phase.update"; phaseChange: BroadcastPhaseChange };

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
	 * hibernation. Viewer identity is passed via query params by the API route.
	 */
	async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get("Upgrade");
		if (upgradeHeader?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		const url = new URL(request.url);
		const viewer: Viewer = {
			name: url.searchParams.get("viewer_name") || "Anonymous",
			userId: url.searchParams.get("viewer_id") || null,
		};

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

		// Hibernatable acceptance: the runtime stores the socket and only wakes
		// the DO on incoming messages or when we call broadcast.
		this.ctx.acceptWebSocket(server);

		// Attach viewer metadata so we can build the presence list later.
		server.serializeAttachment({ viewer } satisfies SocketMeta);

		// Broadcast the updated presence list to everyone (including the new joiner).
		this.broadcastPresence();

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	/**
	 * Collect the deduplicated list of viewers from all connected sockets.
	 */
	private getViewers(): Viewer[] {
		const seen = new Set<string>();
		const viewers: Viewer[] = [];

		for (const ws of this.ctx.getWebSockets()) {
			try {
				const meta = ws.deserializeAttachment() as SocketMeta | null;
				if (!meta?.viewer) continue;
				// Dedupe by userId (authenticated) or name (anonymous).
				const key = meta.viewer.userId ?? `anon:${meta.viewer.name}`;
				if (seen.has(key)) continue;
				seen.add(key);
				viewers.push(meta.viewer);
			} catch {
				// Attachment may not exist on very old sockets. Skip.
			}
		}

		return viewers;
	}

	/**
	 * Send the current viewer list to all connected clients.
	 */
	private broadcastPresence(): void {
		const viewers = this.getViewers();
		const message: ServerMessage = { type: "presence.sync", viewers };
		const payload = JSON.stringify(message);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(payload);
			} catch {
				// ignore
			}
		}
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

	/**
	 * RPC method called by API routes after an approval row has been
	 * inserted or removed. Pushes the freshly-recomputed approval status
	 * to every connected socket so each client can replace its local
	 * state in one shot — no follow-up fetch required.
	 */
	async broadcastApproval(
		approvalStatus: BroadcastApprovalStatus,
	): Promise<void> {
		const message: ServerMessage = {
			type: "approval.update",
			approvalStatus,
		};
		const payload = JSON.stringify(message);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(payload);
			} catch {
				// ignore
			}
		}
	}

	/**
	 * Push the freshly recomputed reaction aggregate for one comment.
	 */
	async broadcastCommentReactions(
		update: BroadcastCommentReactions,
	): Promise<void> {
		const message: ServerMessage = {
			type: "comment.reactions.update",
			update,
		};
		const payload = JSON.stringify(message);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(payload);
			} catch {
				// ignore
			}
		}
	}

	/**
	 * RPC method called by API routes after a video's pipeline phase has
	 * been changed. Pushes the new phase to every connected socket.
	 */
	async broadcastPhaseChange(
		phaseChange: BroadcastPhaseChange,
	): Promise<void> {
		const message: ServerMessage = {
			type: "phase.update",
			phaseChange,
		};
		const payload = JSON.stringify(message);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(payload);
			} catch {
				// ignore
			}
		}
	}

	// No client -> server messages needed yet. Drop anything we receive.
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
		// A viewer left — broadcast updated presence to remaining clients.
		this.broadcastPresence();
	}

	async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
		try {
			ws.close(1011, "internal error");
		} catch {
			// ignore
		}
		// A viewer dropped — broadcast updated presence to remaining clients.
		this.broadcastPresence();
	}
}
