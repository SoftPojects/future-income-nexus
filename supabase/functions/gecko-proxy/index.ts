import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const GECKO_URL = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN_ADDRESS}`;
const CACHE_TTL_SECONDS = 60; // 60 second persistent DB cache

// Warm in-memory cache (secondary, resets on cold start)
let memCache: { json: unknown; expiresAt: number } | null = null;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function readDbCache(): Promise<unknown | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["gecko_cache_data", "gecko_cache_expires_at"]);

    if (!data || data.length < 2) return null;

    const map: Record<string, string> = {};
    data.forEach((row) => { map[row.key] = row.value; });

    const expiresAt = parseInt(map["gecko_cache_expires_at"] ?? "0", 10);
    if (Date.now() > expiresAt) {
      console.log("[gecko-proxy] DB cache expired");
      return null;
    }

    console.log("[gecko-proxy] Serving from DB cache");
    return JSON.parse(map["gecko_cache_data"]);
  } catch (e) {
    console.warn("[gecko-proxy] DB cache read failed:", e);
    return null;
  }
}

async function writeDbCache(json: unknown): Promise<void> {
  try {
    const supabase = getSupabase();
    const expiresAt = Date.now() + CACHE_TTL_SECONDS * 1000;
    await supabase.from("system_settings").upsert([
      { key: "gecko_cache_data", value: JSON.stringify(json) },
      { key: "gecko_cache_expires_at", value: String(expiresAt) },
    ], { onConflict: "key" });
    console.log("[gecko-proxy] DB cache updated, expires in 60s");
  } catch (e) {
    console.warn("[gecko-proxy] DB cache write failed:", e);
  }
}

async function fetchFromGecko(): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${GECKO_URL}?t=${Date.now()}`, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.pow(2, attempt) * 2000;
      console.warn(`[gecko-proxy] 429 rate limited. Waiting ${delayMs}ms (attempt ${attempt + 1}/2)`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    if (!res.ok) {
      throw new Error(`GeckoTerminal returned HTTP ${res.status}`);
    }

    return await res.json();
  }

  throw new Error("GeckoTerminal rate limit: max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // 1. Check warm in-memory cache (fastest)
    if (memCache && Date.now() < memCache.expiresAt) {
      console.log("[gecko-proxy] Serving from memory cache");
      return new Response(JSON.stringify(memCache.json), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "MEM" },
      });
    }

    // 2. Check persistent DB cache (survives cold starts)
    const dbCached = await readDbCache();
    if (dbCached) {
      // Warm the memory cache too
      memCache = { json: dbCached, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 };
      return new Response(JSON.stringify(dbCached), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "DB" },
      });
    }

    // 3. Fetch fresh data from GeckoTerminal
    const data = await fetchFromGecko();

    // Update both caches
    memCache = { json: data, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 };
    await writeDbCache(data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err) {
    console.error("[gecko-proxy] Error:", err);

    // Last resort: try to serve stale DB cache rather than failing
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "gecko_cache_data")
        .single();
      if (data?.value) {
        console.warn("[gecko-proxy] Serving stale cache as fallback");
        return new Response(data.value, {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json", "X-Cache": "STALE" },
        });
      }
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
