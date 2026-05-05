import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

/**
 * Authenticated WebSocket upgrade endpoint for the per-user notification
 * channel. The session cookie is verified by middleware, which populates
 * locals.user before this handler runs. We then forward the upgrade to
 * the user's UserNotifications Durable Object instance.
 */
export const GET: APIRoute = async ({ request, locals }) => {
	const upgradeHeader = request.headers.get("Upgrade");
	if (upgradeHeader?.toLowerCase() !== "websocket") {
		return new Response("Expected WebSocket upgrade", { status: 426 });
	}

	if (!locals.user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const stub = env.USER_NOTIFICATIONS.getByName(locals.user.id);
	return stub.fetch(request);
};
