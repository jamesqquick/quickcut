import { handle } from "@astrojs/cloudflare/handler";

// Re-export Durable Object classes so Wrangler can register them.
export { VideoRoom } from "./durable-objects/VideoRoom";

export default {
	async fetch(request, env, ctx) {
		return handle(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
