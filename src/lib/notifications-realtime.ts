import type { BroadcastUserNotification } from "../durable-objects/UserNotifications";

export type { BroadcastUserNotification } from "../durable-objects/UserNotifications";

type ServerMessage =
	| { type: "notification.new"; notification: BroadcastUserNotification }
	| { type: "notification.read.bulk"; ids: string[] };

export interface UserNotificationHandlers {
	onNotification?: (notification: BroadcastUserNotification) => void;
	onNotificationsRead?: (ids: string[]) => void;
}

export interface UserNotificationConnection {
	disconnect: () => void;
}

/**
 * Open a hibernation-aware WebSocket to the per-user UserNotifications
 * Durable Object. Reconnects with capped exponential backoff so a flaky
 * network or Wrangler reload eventually recovers without a page refresh.
 *
 * If the channel is permanently unavailable, the header badge still
 * reflects the SSR'd count from the most recent page load — graceful
 * degradation is intentional.
 */
export function connectUserNotifications(
	handlers: UserNotificationHandlers,
): UserNotificationConnection {
	let socket: WebSocket | null = null;
	let cancelled = false;
	let retry = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const buildUrl = () => {
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		return `${proto}//${window.location.host}/api/notifications/live`;
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
			if (parsed.type === "notification.new") {
				handlers.onNotification?.(parsed.notification);
			} else if (parsed.type === "notification.read.bulk") {
				handlers.onNotificationsRead?.(parsed.ids);
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
