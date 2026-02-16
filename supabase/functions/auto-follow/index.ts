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

async function getAuthenticatedUserId(): Promise<string | null> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = "https://api.x.com/2/users/me";
  const method = "GET";
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

  const resp = await fetch(url, { headers: { Authorization: authHeader } });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.data?.id || null;
}

async function lookupUserByHandle(handle: string): Promise<string | null> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = `https://api.x.com/2/users/by/username/${handle}`;
  const method = "GET";
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

  const resp = await fetch(url, { headers: { Authorization: authHeader } });
  if (!resp.ok) {
    console.warn(`[AUTO-FOLLOW] User lookup failed for @${handle}: ${resp.status}`);
    return null;
  }
  const data = await resp.json();
  return data.data?.id || null;
}

async function followUser(sourceUserId: string, targetUserId: string): Promise<boolean> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = `https://api.x.com/2/users/${sourceUserId}/following`;
  const method = "POST";
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

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ target_user_id: targetUserId }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.warn(`[AUTO-FOLLOW] Follow failed: ${resp.status} ${err.slice(0, 200)}`);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
    if (!hasKeys) throw new Error("X API credentials not configured");

    // Get our authenticated user ID
    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) throw new Error("Failed to get authenticated user ID");

    // Get targets with auto_follow=true that haven't been followed yet
    const { data: targets, error } = await sb
      .from("target_agents")
      .select("*")
      .eq("auto_follow", true)
      .eq("is_active", true)
      .is("followed_at", null)
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) throw error;
    if (!targets || targets.length === 0) {
      console.log("[AUTO-FOLLOW] No unfollowed targets with auto_follow enabled.");
      return new Response(JSON.stringify({ followed: 0, message: "No targets to follow" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let followedCount = 0;
    const followed: string[] = [];

    for (const target of targets) {
      console.log(`[AUTO-FOLLOW] Looking up @${target.x_handle}...`);
      const targetUserId = await lookupUserByHandle(target.x_handle);
      if (!targetUserId) {
        console.warn(`[AUTO-FOLLOW] Could not find user ID for @${target.x_handle}`);
        continue;
      }

      const success = await followUser(myUserId, targetUserId);
      if (success) {
        followedCount++;
        followed.push(target.x_handle);
        await sb.from("target_agents").update({ followed_at: new Date().toISOString() }).eq("id", target.id);
        console.log(`[AUTO-FOLLOW] Followed @${target.x_handle}`);

        // Rate limit: wait 2s between follows
        if (followedCount < targets.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (followedCount > 0) {
      await sb.from("agent_logs").insert({
        message: `[AUTO-FOLLOW]: Followed ${followedCount} targets: ${followed.map(h => `@${h}`).join(", ")}`,
      });
    }

    console.log(`[AUTO-FOLLOW] Complete: ${followedCount}/${targets.length} followed.`);

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
