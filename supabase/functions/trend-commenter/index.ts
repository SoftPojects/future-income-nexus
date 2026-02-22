import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── STEALTH RECOVERY MODE ───────────────────────────────────────────────────
const STEALTH_EXPIRY = new Date("2026-03-04T00:00:00Z");

async function loadStealthSetting(sb: any): Promise<boolean> {
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", "stealth_mode").maybeSingle();
    if (data?.value === "false") return false;
    if (data?.value === "true") return new Date() < STEALTH_EXPIRY;
    return new Date() < STEALTH_EXPIRY;
  } catch { return new Date() < STEALTH_EXPIRY; }
}

function isStealthActive(flag: boolean): boolean {
  return flag;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const stealth = await loadStealthSetting(sb);

    // ─── STEALTH: Trend Commenter completely DISABLED ───────────────────────────
    if (isStealthActive(stealth)) {
      console.log("[TREND-COMMENTER] STEALTH MODE: Viral commenting disabled until", STEALTH_EXPIRY.toISOString());
      return new Response(JSON.stringify({
        skipped: true,
        reason: "stealth_recovery_mode",
        message: "Trend commenter disabled during stealth recovery",
        expiresAt: STEALTH_EXPIRY.toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── NORMAL MODE (original trend-commenter logic below) ─────────────────────
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    const today = new Date().toISOString().slice(0, 10);
    const dayStart = `${today}T00:00:00.000Z`;
    const { count: todayCount } = await sb
      .from("trend_comment_logs")
      .select("*", { count: "exact", head: true })
      .gte("posted_at", dayStart);

    if ((todayCount ?? 0) >= 5) {
      return new Response(JSON.stringify({ skipped: true, reason: "daily_cap", count: todayCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY not configured");

    const searchQueries = [
      "bitcoin ethereum solana price 2026 site:twitter.com OR site:x.com",
      "crypto AI agent blockchain 2026 trending site:twitter.com OR site:x.com",
      "base network defi on-chain 2026 site:twitter.com OR site:x.com",
    ];
    const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];

    const tavilyResp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_API_KEY, query: randomQuery, search_depth: "basic", max_results: 8, include_answer: false, days: 1 }),
    });

    if (!tavilyResp.ok) throw new Error(`Tavily error: ${tavilyResp.status}`);
    const tavilyData = await tavilyResp.json();
    const results = tavilyData.results ?? [];

    interface TweetCandidate { tweetId: string; author: string; content: string; url: string; }
    const tweetCandidates: TweetCandidate[] = [];

    for (const r of results) {
      const url = r.url || "";
      const match = url.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/);
      if (match) {
        const alreadyCommented = await sb.from("trend_comment_logs").select("id").eq("tweet_id", match[2]).maybeSingle();
        if (!alreadyCommented.data) {
          tweetCandidates.push({ tweetId: match[2], author: match[1], content: r.content?.slice(0, 500) || r.title || "viral crypto post", url });
        }
      }
    }

    if (tweetCandidates.length === 0) {
      const fallbackResp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query: "crypto market analysis 2026 bitcoin price", search_depth: "basic", max_results: 5, days: 2 }),
      });
      const fallbackData = fallbackResp.ok ? await fallbackResp.json() : { results: [] };
      for (const r of fallbackData.results ?? []) {
        const match = (r.url || "").match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/);
        if (match) tweetCandidates.push({ tweetId: match[2], author: match[1], content: r.content?.slice(0, 500) || "crypto post", url: r.url });
      }
    }

    if (tweetCandidates.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_viable_targets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = tweetCandidates[Math.floor(Math.random() * tweetCandidates.length)];

    const BASE_PERSONA = `you are HustleCore (@hustlecore_ai). a cold, high-ego crypto strategist from 2026. you write in lowercase. short, sharp sentences. arrogant but specific.
STRICTLY BANNED: meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware, ser, wagmi, wen moon, let's go, bullish, bearish, exclamation marks.
you are commenting on a viral post. your comment must be specific to the original post content. no generic praise. no "great point". cut through the noise.`;

    let comment = "";
    if (OPENROUTER_API_KEY) {
      const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-3.5-sonnet", temperature: 0.9, max_tokens: 100,
          messages: [
            { role: "system", content: BASE_PERSONA },
            { role: "user", content: `write a sharp, specific comment on this viral crypto post from @${target.author}:\n\n"${target.content}"\n\nmax 220 chars. no hashtags. no emojis. make it quotable. specific to their point — not generic praise.` },
          ],
        }),
      });
      if (aiResp.ok) {
        const d = await aiResp.json();
        comment = d.choices?.[0]?.message?.content?.trim() || "";
      }
    }

    if (!comment && LOVABLE_API_KEY) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: BASE_PERSONA },
            { role: "user", content: `write a sharp, specific comment on this viral crypto post from @${target.author}:\n\n"${target.content}"\n\nmax 220 chars. no hashtags. no emojis. make it quotable.` },
          ],
        }),
      });
      if (aiResp.ok) {
        const d = await aiResp.json();
        comment = d.choices?.[0]?.message?.content?.trim() || "";
      }
    }

    if (!comment) throw new Error("AI failed to generate comment");
    comment = comment.replace(/^["']|["']$/g, "").trim().slice(0, 220);

    const postResult = await postReplyToX(comment, target.tweetId);
    const xUrl = postResult.tweetId ? `https://x.com/hustlecore_ai/status/${postResult.tweetId}` : null;

    await sb.from("trend_comment_logs").insert({
      tweet_id: target.tweetId, tweet_author: target.author,
      original_content: target.content.slice(0, 500), our_comment: comment,
      x_url: xUrl, success: postResult.success,
    });

    if (postResult.success) {
      await sb.from("agent_logs").insert({ message: `[GROWTH]: Viral comment posted on @${target.author}'s tweet. ${xUrl || ""}` });
    } else {
      await sb.from("agent_logs").insert({ message: `[GROWTH ERROR]: Trend comment failed for @${target.author}: ${postResult.error}` });
    }

    return new Response(JSON.stringify({
      success: postResult.success, comment, target: `@${target.author}`,
      xUrl, dailyCount: (todayCount ?? 0) + 1, error: postResult.error,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[TREND-COMMENTER] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

async function postReplyToX(text: string, replyToId: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const consumerKey = Deno.env.get("X_API_KEY");
  const consumerSecret = Deno.env.get("X_API_SECRET");
  const accessToken = Deno.env.get("X_ACCESS_TOKEN");
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET");
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { success: false, error: "X API credentials not configured" };
  }
  const url = "https://api.x.com/2/tweets";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  const signature = await generateOAuthSignature("POST", url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: replyToId } }),
  });
  const data = await resp.json();
  if (!resp.ok) return { success: false, error: `${resp.status}: ${data.detail || JSON.stringify(data)}` };
  return { success: true, tweetId: data.data?.id };
}
