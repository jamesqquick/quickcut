import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getAuth } from "../../../lib/auth";

export const ALL: APIRoute = async ({ request }) => {
  const auth = getAuth(env);
  return auth.handler(request);
};
