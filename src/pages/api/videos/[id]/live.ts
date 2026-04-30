import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../../../db";
import { users } from "../../../../db/schema";
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

	// Build the forwarded URL with viewer identity for presence tracking.
	const forwardUrl = new URL(request.url);

	if (access.identity.type === "user") {
		forwardUrl.searchParams.set("viewer_id", access.identity.userId);
		// Look up the display name for the authenticated user.
		const userRow = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, access.identity.userId))
			.limit(1);
		forwardUrl.searchParams.set(
			"viewer_name",
			userRow[0]?.name || "Unknown",
		);
	} else {
		// Anonymous viewers pass their name via the `viewer_name` query param
		// set by the client-side realtime connector.
		const clientName = forwardUrl.searchParams.get("viewer_name");
		if (!clientName) {
			forwardUrl.searchParams.set("viewer_name", "Anonymous");
		}
	}

	// Forward the upgrade Request to the per-video DO instance.
	const stub = env.VIDEO_ROOM.getByName(id);
	return stub.fetch(new Request(forwardUrl.toString(), request));
};
