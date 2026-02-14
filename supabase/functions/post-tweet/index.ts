import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple OAuth 1.0a implementation for Twitter API v2
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
  const sortedParams = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function postToTwitter(text: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const consumerKey = Deno.env.get("X_API_KEY");
  const consumerSecret = Deno.env.get("X_API_SECRET");
  const accessToken = Deno.env.get("X_ACCESS_TOKEN");
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET");

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { success: false, error: "X API credentials not configured" };
  }

  const url = "https://api.x.com/2/tweets";
  const method = "POST";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // Do NOT include POST body parameters in the signature for JSON requests
  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("Twitter API error:", resp.status, JSON.stringify(data));
    return { success: false, error: data.detail || data.title || "Twitter API error" };
  }

  return { success: true, tweetId: data.data?.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Health check endpoint
    if (body.healthCheck) {
      const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
      return new Response(
        JSON.stringify({ status: hasKeys ? "connected" : "missing_keys" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Direct post mode — used by donation tweets for instant posting
    if (body.directPost && typeof body.directPost === "string") {
      const result = await postToTwitter(body.directPost);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Post a specific tweet by ID
    if (body.tweetId) {
      const { data: tweet, error } = await sb
        .from("tweet_queue")
        .select("*")
        .eq("id", body.tweetId)
        .eq("status", "pending")
        .single();

      if (error || !tweet) {
        return new Response(
          JSON.stringify({ error: "Tweet not found or already posted" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await postToTwitter(tweet.content);
      if (result.success) {
        await sb.from("tweet_queue").update({ status: "posted", posted_at: new Date().toISOString(), error_message: null }).eq("id", tweet.id);
      } else {
        await sb.from("tweet_queue").update({ status: "error", error_message: result.error || "Unknown error" }).eq("id", tweet.id);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Post next pending tweet
    const { data: nextTweet } = await sb
      .from("tweet_queue")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();

    if (!nextTweet) {
      return new Response(JSON.stringify({ message: "No pending tweets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await postToTwitter(nextTweet.content);
    if (result.success) {
      await sb.from("tweet_queue").update({ status: "posted", posted_at: new Date().toISOString(), error_message: null }).eq("id", nextTweet.id);
    } else {
      await sb.from("tweet_queue").update({ status: "error", error_message: result.error || "Unknown error" }).eq("id", nextTweet.id);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
