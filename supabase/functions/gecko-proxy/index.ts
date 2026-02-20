import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const GECKO_URL = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN_ADDRESS}`;
const CACHE_TTL_MS = 60_000; // Cache for 60 seconds to avoid rate limits

// In-memory cache shared across requests within the same function instance
let cachedData: { json: unknown; expiresAt: number } | null = null;

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      let delayMs = Math.pow(2, attempt) * 1500; // 1.5s, 3s, 6s, 12s

      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) delayMs = seconds * 1000;
      }

      // Add jitter
      delayMs += Math.random() * 500;

      console.warn(`[gecko-proxy] 429 rate limited. Waiting ${delayMs.toFixed(0)}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    return res;
  }

  throw new Error("GeckoTerminal rate limit: max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Serve from cache if still valid
    if (cachedData && Date.now() < cachedData.expiresAt) {
      console.log("[gecko-proxy] Serving from cache");
      return new Response(JSON.stringify(cachedData.json), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const res = await fetchWithRetry(GECKO_URL);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `GeckoTerminal returned HTTP ${res.status}` }),
        { status: res.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();

    // Store in cache
    cachedData = { json: data, expiresAt: Date.now() + CACHE_TTL_MS };
    console.log("[gecko-proxy] Cached fresh data, expires in 60s");

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("[gecko-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
