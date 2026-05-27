import { waitUntil } from "cloudflare:workers";

/**
 * Schedule a fire-and-forget background task via `waitUntil`. Any
 * rejection is logged and swallowed so it never surfaces as an
 * unhandled rejection in the Worker runtime.
 */
export function defer(promise: Promise<unknown>): void {
  waitUntil(promise.catch((err) => {
    console.error("Background task failed", err);
  }));
}
