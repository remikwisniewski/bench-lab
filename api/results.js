// POST /api/results — submit a finished benchmark result.

import { hashIp, submit } from "./_lib/leaderboard.js";
import { storeFromEnv } from "./_lib/store.js";

const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** @param {Request} request */
export async function POST(request) {
  const store = storeFromEnv();
  if (!store) return json({ errors: ["The ranking database isn't connected yet"] }, 503);
  /** @type {unknown} */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ errors: ["Body must be JSON"] }, 400);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  try {
    const out = await submit(store, body, { ipHash: hashIp(ip, process.env.IP_SALT || "bench-lab") });
    return json(out.body, out.status);
  } catch (error) {
    console.error(error);
    return json({ errors: ["Couldn't save the result"] }, 502);
  }
}
