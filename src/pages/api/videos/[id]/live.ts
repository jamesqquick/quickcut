import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { verifyVideoAccess } from "../../../../lib/auth";

// This route is an authenticated WebSocket upgrade. It is not subject to the
// JSON middleware checks because middleware lets through any /api/* path that
// doesn't start with the protected prefixes. We do our own auth here via
// verifyVideoAccess, which supports both session cookies and share-link tokens.

export const GET: APIRoute = async ({ params, request }) => {
	const { id } = params;
	if (!id) {
		return new Response("Video ID required", { status: 400 });
	}

	const upgradeHeader = request.headers.get("Upgrade");
	if (upgradeHeader?.toLowerCase() !== "websocket") {
		return new Response("Expected WebSocket upgrade", { status: 426 });
	}

	const db = createDb(env.DB);
	const access = await verifyVideoAccess(db, request, id);
	if (!access.ok) {
		return new Response(access.error, { status: access.status });
	}

	// Forward the upgrade Request to the per-video DO instance.
	const stub = env.VIDEO_ROOM.getByName(id);
	return stub.fetch(request);
};
