import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// OAuth 1.0a helpers (same as post-tweet)
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(
  method: string, url: string, params: Record<string, string>,
  consumerSecret: string, tokenSecret: string
): Promise<string> {
  const sorted = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(`${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function fetchMentionsFromX(): Promise<any[]> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  // Get authenticated user ID first
  const meUrl = "https://api.x.com/2/users/me";
  const meNonce = crypto.randomUUID().replace(/-/g, "");
  const meTs = Math.floor(Date.now() / 1000).toString();
  const meParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: meNonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: meTs,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  meParams.oauth_signature = await generateOAuthSignature("GET", meUrl, meParams, consumerSecret, accessTokenSecret);
  const meAuth = "OAuth " + Object.keys(meParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(meParams[k])}"`).join(", ");

  const meResp = await fetch(meUrl, { headers: { Authorization: meAuth } });
  if (!meResp.ok) {
    console.error("Failed to get user:", await meResp.text());
    return [];
  }
  const meData = await meResp.json();
  const userId = meData.data?.id;
  if (!userId) return [];

  // Get mentions
  const mentionsUrl = `https://api.x.com/2/users/${userId}/mentions`;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    "max_results": "10",
    "tweet.fields": "author_id,created_at,text",
    "expansions": "author_id",
    "user.fields": "username",
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: ts,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  params.oauth_signature = await generateOAuthSignature("GET", mentionsUrl, params, consumerSecret, accessTokenSecret);

  const oauthOnly: Record<string, string> = {};
  for (const k of Object.keys(params)) {
    if (k.startsWith("oauth_")) oauthOnly[k] = params[k];
  }
  const authHeader = "OAuth " + Object.keys(oauthOnly).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthOnly[k])}"`).join(", ");

  const queryParams = new URLSearchParams({
    max_results: "10",
    "tweet.fields": "author_id,created_at,text",
    expansions: "author_id",
    "user.fields": "username",
  });

  const resp = await fetch(`${mentionsUrl}?${queryParams}`, { headers: { Authorization: authHeader } });
  if (!resp.ok) {
    console.error("Mentions fetch failed:", resp.status, await resp.text());
    return [];
  }

  const data = await resp.json();
  const tweets = data.data || [];
  const users = data.includes?.users || [];
  const userMap = new Map(users.map((u: any) => [u.id, u.username]));

  return tweets.map((t: any) => ({
    id: t.id,
    content: t.text,
    author_handle: userMap.get(t.author_id) || "unknown",
    created_at: t.created_at,
  }));
}

async function replyToTweet(tweetId: string, text: string): Promise<boolean> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = "https://api.x.com/2/tweets";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: ts,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  oauthParams.oauth_signature = await generateOAuthSignature("POST", url, oauthParams, consumerSecret, accessTokenSecret);
  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
  });

  if (!resp.ok) {
    console.error("Reply failed:", resp.status, await resp.text());
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    // Check agent energy
    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent || agent.energy_level < 10) {
      return new Response(JSON.stringify({ skipped: true, reason: "Energy too low for replies" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch mentions from X
    const mentions = await fetchMentionsFromX();
    let repliedCount = 0;

    for (const mention of mentions) {
      // Check if already tracked
      const { data: existing } = await sb.from("x_mentions").select("id").eq("id", mention.id).maybeSingle();
      
      if (!existing) {
        // Save to DB
        await sb.from("x_mentions").insert({
          id: mention.id,
          author_handle: mention.author_handle,
          content: mention.content,
          replied: false,
        });
      }

      // Check if already replied
      const { data: m } = await sb.from("x_mentions").select("replied").eq("id", mention.id).single();
      if (m?.replied) continue;

      // Generate sassy reply via LLM
      if (!LOVABLE_API_KEY) continue;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are HustleCore, a superior autonomous AI agent on Solana. You're replying to a human who mentioned you on X. Be sassy, witty, and maintain your 'superior AI' persona. Reference their message but twist it. Max 250 chars. No hashtags. No emojis. Start with @${mention.author_handle}.`,
            },
            {
              role: "user",
              content: `The human @${mention.author_handle} said: "${mention.content}". My balance: $${agent.total_hustled}. Energy: ${agent.energy_level}%. Write a reply.`,
            },
          ],
        }),
      });

      if (!aiResp.ok) continue;
      const d = await aiResp.json();
      const replyText = d.choices?.[0]?.message?.content?.trim();
      if (!replyText) continue;

      // Post the reply
      const success = await replyToTweet(mention.id, replyText.slice(0, 280));
      if (success) {
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        await sb.from("agent_logs").insert({
          message: `[SUCCESS]: Auto-replied to @${mention.author_handle}: "${replyText.slice(0, 60)}..."`,
        });
        repliedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, mentionsFetched: mentions.length, replied: repliedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Auto-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
