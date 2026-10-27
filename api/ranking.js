// GET /api/ranking?test=multi — the best score per device.

import { ranking } from "./_lib/leaderboard.js";
import { storeFromEnv } from "./_lib/store.js";

/** @param {Request} request */
export async function GET(request) {
  const store = storeFromEnv();
  const headers = { "content-type": "application/json" };
  if (!store)
    return new Response(JSON.stringify({ errors: ["The ranking database isn't connected yet"] }), {
      status: 503,
      headers,
    });
  try {
    const out = await ranking(store, new URL(request.url).searchParams.get("test"));
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { ...headers, "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ errors: ["Couldn't load the ranking"] }), { status: 502, headers });
  }
}
