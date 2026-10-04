import type { Env, ExecutionContext } from "./env";
import { json } from "./http";
import { handleWaitlist } from "./waitlist";

// Only /api/* reaches this script (assets.run_worker_first in wrangler.jsonc);
// every page is served straight from the static export in ./out.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/waitlist" || pathname === "/api/waitlist/") {
      return handleWaitlist(request, env, ctx);
    }
    return json({ error: "not_found" }, 404);
  },
};
