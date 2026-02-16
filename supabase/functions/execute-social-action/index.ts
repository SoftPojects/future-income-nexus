import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(
  method: string, url: string, params: Record<string, string>,
  consumerSecret: string, tokenSecret: string
): Promise<string> {
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

async function followUser(sourceUserId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const resp = await makeOAuthRequest(
    `https://api.x.com/2/users/${sourceUserId}/following`, "POST",
    JSON.stringify({ target_user_id: targetUserId })
  );
  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Follow failed: ${resp.status} ${err.slice(0, 200)}` };
  }
  return { success: true };
}

async function getLatestTweetId(userId: string): Promise<string | null> {
  const url = `https://api.x.com/2/users/${userId}/tweets?max_results=5&exclude=retweets,replies`;

  // Build OAuth with query params included in signature
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const baseUrl = `https://api.x.com/2/users/${userId}/tweets`;
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
    max_results: "5", exclude: "retweets,replies",
  };
  const signature = await generateOAuthSignature("GET", baseUrl, oauthParams, consumerSecret, accessTokenSecret);
  
  const authOnlyParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
    oauth_signature: signature,
  };
  const authHeader = "OAuth " + Object.keys(authOnlyParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(authOnlyParams[k])}"`).join(", ");

  const resp = await fetch(url, { headers: { Authorization: authHeader } });
  if (!resp.ok) {
    console.warn(`[EXECUTE] Failed to get tweets for user ${userId}: ${resp.status}`);
    return null;
  }
  const data = await resp.json();
  return data.data?.[0]?.id || null;
}

async function likeTweet(userId: string, tweetId: string): Promise<{ success: boolean; error?: string }> {
  const resp = await makeOAuthRequest(
    `https://api.x.com/2/users/${userId}/likes`, "POST",
    JSON.stringify({ tweet_id: tweetId })
  );
  if (!resp.ok) {
    const err = await resp.text();
    return { success: false, error: `Like failed: ${resp.status} ${err.slice(0, 200)}` };
  }
  return { success: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { targetId } = await req.json();
    if (!targetId) throw new Error("Missing targetId");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rate limit check: max 5 manual executions per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from("social_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo)
      .eq("source", "manual_exec");

    if ((count || 0) >= 5) {
      return new Response(JSON.stringify({ 
        error: "Rate limit: Maximum 5 manual executions per hour. Try again later.",
        rateLimited: true 
      }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target
    const { data: target, error: tErr } = await sb.from("target_agents").select("*").eq("id", targetId).single();
    if (tErr || !target) throw new Error("Target not found");

    const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
    if (!hasKeys) throw new Error("X API credentials not configured");

    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) throw new Error("Failed to get authenticated user ID");

    const targetUserId = await lookupUserByHandle(target.x_handle);
    if (!targetUserId) throw new Error(`Could not find X user @${target.x_handle}`);

    const results: string[] = [];
    let followOk = false;
    let likeOk = false;

    // 1. Follow
    console.log(`[EXECUTE] Following @${target.x_handle}...`);
    const followResult = await followUser(myUserId, targetUserId);
    if (followResult.success) {
      followOk = true;
      results.push("Followed");
      await sb.from("target_agents").update({ followed_at: new Date().toISOString() }).eq("id", target.id);
      await sb.from("social_logs").insert({
        target_handle: target.x_handle,
        action_type: "follow",
        source: "manual_exec",
      });
    } else {
      results.push(`Follow error: ${followResult.error}`);
    }

    // 2. Like latest tweet
    console.log(`[EXECUTE] Getting latest tweet from @${target.x_handle}...`);
    const latestTweetId = await getLatestTweetId(targetUserId);
    if (latestTweetId) {
      const likeResult = await likeTweet(myUserId, latestTweetId);
      if (likeResult.success) {
        likeOk = true;
        results.push("Liked latest tweet");
        await sb.from("social_logs").insert({
          target_handle: target.x_handle,
          action_type: "like",
          source: "manual_exec",
        });
      } else {
        results.push(`Like error: ${likeResult.error}`);
      }
    } else {
      results.push("No tweets found to like");
    }

    // Log
    const summary = followOk && likeOk
      ? `Followed & Liked @${target.x_handle}`
      : followOk
        ? `Followed @${target.x_handle} (like failed)`
        : likeOk
          ? `Liked @${target.x_handle} (follow failed)`
          : `Failed actions on @${target.x_handle}`;

    await sb.from("agent_logs").insert({ message: `[EXECUTE]: ${summary}` });

    return new Response(JSON.stringify({
      success: followOk || likeOk,
      followed: followOk,
      liked: likeOk,
      handle: target.x_handle,
      details: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[EXECUTE] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
