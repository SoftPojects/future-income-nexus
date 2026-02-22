import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── STEALTH RECOVERY MODE ───────────────────────────────────────────────────
const STEALTH_MODE = true;
const STEALTH_EXPIRY = new Date("2026-03-04T00:00:00Z");

function isStealthActive(): boolean {
  return STEALTH_MODE && new Date() < STEALTH_EXPIRY;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── STEALTH: Auto-Follow completely DISABLED ─────────────────────────────
    if (isStealthActive()) {
      console.log("[AUTO-FOLLOW] STEALTH MODE: Auto-follow disabled until", STEALTH_EXPIRY.toISOString());
      return new Response(JSON.stringify({ 
        followed: 0, 
        message: "Auto-follow disabled (stealth recovery mode)",
        stealthMode: true,
        expiresAt: STEALTH_EXPIRY.toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── NORMAL MODE (original auto-follow logic) ─────────────────────────────
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let discoveryOnly = false;
    try {
      const body = await req.json();
      discoveryOnly = body?.discoveryOnly === true;
    } catch { /* no body */ }

    if (discoveryOnly) {
      console.log("[AUTO-FOLLOW] Discovery-only mode triggered.");
      const discovered = await discoverNewTargets(sb);
      if (discovered.length > 0) {
        const { data: existing } = await sb.from("target_agents").select("x_handle");
        const existingHandles = new Set((existing || []).map((t: any) => t.x_handle.toLowerCase()));
        const newHandles = discovered.filter((h) => !existingHandles.has(h.toLowerCase()));
        for (const handle of newHandles) {
          await sb.from("target_agents").insert({ x_handle: handle, auto_follow: true, source: "discovery", priority: 10 });
        }
        if (newHandles.length > 0) {
          await sb.from("agent_logs").insert({ message: `[DISCOVERY]: Found ${newHandles.length} new targets: ${newHandles.map(h => `@${h}`).join(", ")}` });
        }
        return new Response(JSON.stringify({ success: true, discovered: newHandles.length, handles: newHandles }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, discovered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
    if (!hasKeys) throw new Error("X API credentials not configured");

    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) throw new Error("Failed to get authenticated user ID");

    const { data: targets, error } = await sb
      .from("target_agents")
      .select("*")
      .eq("auto_follow", true)
      .eq("is_active", true)
      .is("followed_at", null)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) throw error;

    let workingTargets = targets || [];

    if (workingTargets.length === 0) {
      const discovered = await discoverNewTargets(sb);
      if (discovered.length > 0) {
        const { data: existing } = await sb.from("target_agents").select("x_handle");
        const existingHandles = new Set((existing || []).map((t: any) => t.x_handle.toLowerCase()));
        const newHandles = discovered.filter((h) => !existingHandles.has(h.toLowerCase()));
        for (const handle of newHandles) {
          await sb.from("target_agents").insert({ x_handle: handle, auto_follow: true, source: "discovery", priority: 10 });
        }
        if (newHandles.length > 0) {
          await sb.from("agent_logs").insert({ message: `[DISCOVERY]: Found ${newHandles.length} new targets: ${newHandles.map(h => `@${h}`).join(", ")}` });
          const { data: refreshed } = await sb.from("target_agents").select("*").eq("auto_follow", true).eq("is_active", true).is("followed_at", null).order("priority", { ascending: true }).limit(5);
          workingTargets = refreshed || [];
        }
      }
    }

    if (workingTargets.length === 0) {
      return new Response(JSON.stringify({ followed: 0, message: "No targets to follow" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let followedCount = 0;
    const followed: string[] = [];

    for (const target of workingTargets) {
      const targetUserId = await lookupUserByHandle(target.x_handle);
      if (!targetUserId) continue;
      const success = await followUser(myUserId, targetUserId);
      if (success) {
        followedCount++;
        followed.push(target.x_handle);
        await sb.from("target_agents").update({ followed_at: new Date().toISOString() }).eq("id", target.id);
        await sb.from("social_logs").insert({ target_handle: target.x_handle, action_type: "follow", source: target.source || "manual" });
        if (followedCount < workingTargets.length) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (followedCount > 0) {
      await sb.from("agent_logs").insert({ message: `[AUTO-FOLLOW]: Followed ${followedCount} targets: ${followed.map(h => `@${h}`).join(", ")}` });
    }

    return new Response(JSON.stringify({ followed: followedCount, targets: followed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[AUTO-FOLLOW] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── OAuth helpers ────────────────────────────────────────────────────────────
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string): Promise<string> {
  const sortedParams = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function makeOAuthRequest(url: string, method: string, body?: string): Promise<Response> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
  const headers: Record<string, string> = { Authorization: authHeader };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, { method, headers, ...(body ? { body } : {}) });
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const resp = await makeOAuthRequest("https://api.x.com/2/users/me", "GET");
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.data?.id || null;
}

async function lookupUserByHandle(handle: string): Promise<string | null> {
  const resp = await makeOAuthRequest(`https://api.x.com/2/users/by/username/${handle}`, "GET");
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.data?.id || null;
}

async function followUser(sourceUserId: string, targetUserId: string): Promise<boolean> {
  const resp = await makeOAuthRequest(`https://api.x.com/2/users/${sourceUserId}/following`, "POST", JSON.stringify({ target_user_id: targetUserId }));
  if (!resp.ok) return false;
  return true;
}

async function discoverNewTargets(sb: any): Promise<string[]> {
  const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!TAVILY_API_KEY || !LOVABLE_API_KEY) return [];

  const queries = [
    "trending AI agents crypto X Twitter accounts to follow 2026",
    "popular Base network AI agent influencers crypto Twitter handles",
  ];
  const searchResults: string[] = [];

  for (const query of queries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: true }),
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        if (data.answer) searchResults.push(data.answer);
        if (data.results) {
          for (const r of data.results.slice(0, 3)) searchResults.push(`[${r.title}]: ${r.content?.slice(0, 300) || ""}`);
        }
      }
    } catch (e) { console.warn(`[DISCOVERY] Tavily failed: ${e}`); }
  }

  const rawIntel = searchResults.join("\n\n").slice(0, 3000);
  if (rawIntel.length < 50) return [];

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", max_tokens: 300,
        messages: [
          { role: "system", content: `Extract exactly 5 X/Twitter handles of trending AI agent projects or Base ecosystem influencers. Return ONLY handles, one per line, without @.` },
          { role: "user", content: rawIntel },
        ],
      }),
    });
    if (!resp.ok) return [];
    const d = await resp.json();
    const text = d.choices?.[0]?.message?.content?.trim() || "";
    return text.split("\n").map((l: string) => l.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").trim()).filter((h: string) => h.length >= 2 && h.length <= 15).slice(0, 5);
  } catch { return []; }
}
