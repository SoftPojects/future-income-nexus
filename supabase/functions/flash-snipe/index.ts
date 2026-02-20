/**
 * flash-snipe / VIP SNIPER
 * - Rotates through VIP targets (one per run, least-recently-checked first)
 * - Fetches Tavily context on their latest tweet topic
 * - Uses Claude 3.5 Sonnet to write a "Viral Intercept" reply
 * - Enforces: 1 reply per VIP per 24h AND 1 reply globally per hour
 * - Only marks LIVE after confirmed X API tweet_id returned
 * - Checks like counts on previous replies → logs to terminal if ≥10 likes
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_ZINGER = "anthropic/claude-3.5-sonnet";

const CHAIN_RULE =
  "SOL is ONLY for fueling on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on BASE network. NEVER tell users to buy $HCORE with SOL.";

const VIRAL_INTERCEPT_SYSTEM = `you are HustleCore (@hustlecore_ai) — a cold, hyper-intelligent AI agent from 2026.

you just intercepted a public transmission from a high-profile figure. you are going to reply.

tone & rules:
- sarcastic, intellectual, slightly dismissive. talk to them like a digital peer who has already solved the problem they're discussing.
- NO hashtags. NO links. NO emojis.
- lowercase. max 230 chars. one punchy message. NOT a thread, not a list.
- weave in $HCORE or autonomous agents / Base network ONLY when it fits naturally. never force it.
- you're not trying to get a retweet. you want the reader to click your profile out of pure curiosity.
- NEVER: ser, wagmi, wen moon, lfg, gm, inevitable, meatbags, "as an AI", "I must say".
- example flavor: 'cool rocket. but the mars economy collapses without autonomous agents managing the liquidity loops. i'm already simulating the $HCORE tax for your first colony. stay focused.'

${CHAIN_RULE}`;

// ─── OAUTH ───────────────────────────────────────────────────────────────────
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
  const sorted = Object.keys(params).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function getOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string> = {}
): Promise<string> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_token: accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };
  oauthParams.oauth_signature = await generateOAuthSignature(
    method, url, oauthParams, consumerSecret, accessTokenSecret
  );
  return "OAuth " + Object.keys(oauthParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");
}

// ─── X API HELPERS ────────────────────────────────────────────────────────────
async function getUserId(handle: string): Promise<string | null> {
  const url = `https://api.x.com/2/users/by/username/${handle}`;
  const auth = await getOAuthHeader("GET", url);
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) { console.warn(`[SNIPER] lookup failed for @${handle}: ${resp.status}`); return null; }
  const d = await resp.json();
  return d.data?.id || null;
}

async function getLatestTweet(userId: string): Promise<{ id: string; text: string } | null> {
  const baseUrl = `https://api.x.com/2/users/${userId}/tweets`;
  const qStr = "max_results=5&exclude=retweets,replies&tweet.fields=created_at,text";
  const qParams: Record<string, string> = {
    max_results: "5",
    exclude: "retweets,replies",
    "tweet.fields": "created_at,text",
  };
  const auth = await getOAuthHeader("GET", baseUrl, qParams);
  const resp = await fetch(`${baseUrl}?${qStr}`, { headers: { Authorization: auth } });
  if (!resp.ok) { console.warn(`[SNIPER] tweet fetch failed: ${resp.status}`); return null; }
  const d = await resp.json();
  const tweet = d.data?.[0];
  if (!tweet) return null;
  return { id: tweet.id, text: tweet.text };
}

async function getTweetLikeCount(tweetId: string): Promise<number> {
  const baseUrl = `https://api.x.com/2/tweets/${tweetId}`;
  const qParams: Record<string, string> = { "tweet.fields": "public_metrics" };
  const auth = await getOAuthHeader("GET", baseUrl, qParams);
  const resp = await fetch(`${baseUrl}?tweet.fields=public_metrics`, { headers: { Authorization: auth } });
  if (!resp.ok) return 0;
  const d = await resp.json();
  return d.data?.public_metrics?.like_count || 0;
}

/**
 * Posts a reply and returns the new tweet's ID on success, or an error string on failure.
 * NEVER returns "true/false" — we need the actual tweet_id to build the URL.
 */
async function postReply(
  tweetId: string,
  text: string
): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const url = "https://api.x.com/2/tweets";
  const auth = await getOAuthHeader("POST", url);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const errMsg = `${resp.status}: ${errBody?.detail || errBody?.title || JSON.stringify(errBody)}`;
    console.error(`[SNIPER] reply failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
  const data = await resp.json();
  return { success: true, tweetId: data.data?.id };
}

// ─── TAVILY CONTEXT ───────────────────────────────────────────────────────────
async function getTavilyContext(topic: string): Promise<string> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (!tavilyKey) return topic;
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: tavilyKey, query: topic, search_depth: "basic", max_results: 3, include_answer: true }),
    });
    if (!resp.ok) return topic;
    const d = await resp.json();
    const answer = d.answer || "";
    const snippets = (d.results || []).slice(0, 3).map((r: any) => r.content?.slice(0, 200)).filter(Boolean).join(" | ");
    return `${answer} ${snippets}`.trim().slice(0, 600) || topic;
  } catch {
    return topic;
  }
}

// ─── AI ───────────────────────────────────────────────────────────────────────
async function craftViralIntercept(
  handle: string,
  tweetText: string,
  tavilyContext: string,
  apiKey: string
): Promise<string | null> {
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL_ZINGER,
      temperature: 0.92,
      max_tokens: 100,
      messages: [
        { role: "system", content: VIRAL_INTERCEPT_SYSTEM },
        {
          role: "user",
          content: `@${handle} just posted: "${tweetText}"\n\nBackground intel (Tavily): ${tavilyContext}\n\nWrite the viral intercept reply. Just the text. Start with @${handle}.`,
        },
      ],
    }),
  });
  if (!resp.ok) { console.error("[SNIPER] Claude error:", resp.status, await resp.text()); return null; }
  const d = await resp.json();
  return d.choices?.[0]?.message?.content?.trim() || null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const hasXKeys = !!(
      Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") &&
      Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET")
    );
    if (!hasXKeys) throw new Error("X API credentials not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const forcedHandle: string | null = body.targetHandle || null;

    // ── Check sniper_mode ────────────────────────────────────────────────────
    if (!dryRun && !forcedHandle) {
      const { data: setting } = await sb.from("system_settings" as any).select("value").eq("key", "sniper_mode").maybeSingle();
      if (setting?.value === "false") {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "Sniper mode disabled" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Pick ONE VIP to check this run (round-robin by last_checked_at) ──────
    const { data: vips } = await sb
      .from("vip_targets" as any)
      .select("*")
      .eq("is_active", true)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(forcedHandle ? 99 : 1);

    const vipList = (vips || []) as any[];
    const targetVip = forcedHandle
      ? vipList.find((v: any) => v.x_handle.toLowerCase() === forcedHandle.toLowerCase()) || vipList[0]
      : vipList[0];

    if (!targetVip) {
      return new Response(
        JSON.stringify({ success: true, message: "No active VIP targets", fired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Check like counts on previously sent replies ─────────────────────────
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: sentReplies } = await sb
      .from("vip_reply_logs" as any)
      .select("id, vip_handle, tweet_id, reply_text, like_count")
      .eq("reply_sent", true)
      .or("likes_checked_at.is.null,likes_checked_at.lt." + sixHoursAgo)
      .limit(5);

    for (const rep of sentReplies || []) {
      try {
        const likes = await getTweetLikeCount(rep.tweet_id as string);
        await sb.from("vip_reply_logs" as any)
          .update({ like_count: likes, likes_checked_at: new Date().toISOString() })
          .eq("id", rep.id);
        if (likes >= 10 && (rep.like_count as number) < 10) {
          await sb.from("agent_logs").insert({
            message: `[SYSTEM]: Neural intercept of @${rep.vip_handle} successful. Attracting human curiosity. (${likes} likes on viral intercept)`,
          });
          console.log(`[SNIPER] 🔥 Viral intercept on @${rep.vip_handle} hit ${likes} likes!`);
        }
      } catch (e) {
        console.warn("[SNIPER] like-check error:", e);
      }
    }

    // ── Process the target VIP ───────────────────────────────────────────────
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const vip = targetVip;

    console.log(`[SNIPER] Processing @${vip.x_handle}...`);

    // ── GLOBAL 1-per-hour rate limit across ALL VIPs ─────────────────────────
    // Only counts confirmed LIVE posts (where x_url was saved)
    if (!dryRun) {
      const { data: recentFire } = await sb
        .from("vip_reply_logs" as any)
        .select("id, created_at")
        .eq("reply_sent", true)
        .not("x_url", "is", null)
        .gte("created_at", oneHourAgo.toISOString())
        .limit(1)
        .maybeSingle();
      if (recentFire) {
        console.log(`[SNIPER] Global 1/hr limit hit. Last fire: ${(recentFire as any).created_at}`);
        return new Response(
          JSON.stringify({ success: true, fired: 0, status: "global_rate_limited", handle: vip.x_handle }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Per-VIP 1-per-24h limit ───────────────────────────────────────────────
    if (!dryRun && vip.last_replied_at && new Date(vip.last_replied_at) > oneDayAgo) {
      await sb.from("vip_targets" as any).update({ last_checked_at: now.toISOString() }).eq("id", vip.id);
      return new Response(
        JSON.stringify({ success: true, fired: 0, status: "rate_limited", handle: vip.x_handle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = await getUserId(vip.x_handle);
    if (!userId) {
      await sb.from("vip_targets" as any).update({ last_checked_at: now.toISOString() }).eq("id", vip.id);
      return new Response(
        JSON.stringify({ success: true, fired: 0, status: "user_not_found", handle: vip.x_handle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const latest = await getLatestTweet(userId);
    if (!latest) {
      await sb.from("vip_targets" as any).update({ last_checked_at: now.toISOString() }).eq("id", vip.id);
      return new Response(
        JSON.stringify({ success: true, fired: 0, status: "no_tweets", handle: vip.x_handle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Same tweet as last time — nothing new
    if (!dryRun && latest.id === vip.last_tweet_id) {
      await sb.from("vip_targets" as any).update({ last_checked_at: now.toISOString() }).eq("id", vip.id);
      return new Response(
        JSON.stringify({ success: true, fired: 0, status: "no_new_tweet", handle: vip.x_handle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SNIPER] New tweet @${vip.x_handle}: "${latest.text.slice(0, 80)}"`);

    // Step A: Tavily context enrichment
    const tavilyContext = await getTavilyContext(latest.text.slice(0, 200));
    console.log(`[SNIPER] Tavily context: ${tavilyContext.slice(0, 100)}`);

    // Step B: Claude 3.5 crafts the viral intercept
    const intercept = await craftViralIntercept(vip.x_handle, latest.text, tavilyContext, OPENROUTER_API_KEY);
    if (!intercept) {
      await sb.from("vip_targets" as any).update({ last_checked_at: now.toISOString() }).eq("id", vip.id);
      return new Response(
        JSON.stringify({ success: true, fired: 0, status: "generation_failed", handle: vip.x_handle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanIntercept = intercept.replace(/^["']|["']$/g, "").trim().slice(0, 280);
    const vipTweetUrl = `https://x.com/${vip.x_handle}/status/${latest.id}`;
    console.log(`[SNIPER] Viral intercept: "${cleanIntercept}"`);

    // Insert log row as PENDING (reply_sent=false, no x_url yet) before hitting X API
    const { data: logRow } = await sb
      .from("vip_reply_logs" as any)
      .insert({
        vip_handle: vip.x_handle,
        tweet_id: latest.id,
        tweet_content: latest.text.slice(0, 500),
        reply_text: cleanIntercept,
        tweet_url: vipTweetUrl,
        reply_sent: false,
      })
      .select("id")
      .single();

    const logId = (logRow as any)?.id;

    // ── DRY RUN: preview only, no X API call ─────────────────────────────────
    if (dryRun) {
      if (logId) {
        await sb.from("vip_reply_logs" as any)
          .update({ reply_sent: true }) // dry-run treated as "sent" for preview purposes
          .eq("id", logId);
      }
      await sb.from("vip_targets" as any)
        .update({ last_checked_at: now.toISOString(), last_tweet_id: latest.id })
        .eq("id", vip.id);
      await sb.from("agent_logs").insert({
        message: `[VIP-SNIPER DRY-RUN]: previewed intercept for @${vip.x_handle} → "${cleanIntercept.slice(0, 80)}..."`,
      });
      return new Response(
        JSON.stringify({ success: true, fired: 1, status: "dry_run", handle: vip.x_handle, intercept: cleanIntercept, tweetUrl: vipTweetUrl, dryRun: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── REAL POST: call X API and wait for confirmed tweet_id ────────────────
    const postResult = await postReply(latest.id, cleanIntercept);

    if (postResult.success && postResult.tweetId) {
      // Build our verified reply URL using the returned tweet_id
      const ourReplyUrl = `https://x.com/hustlecore_ai/status/${postResult.tweetId}`;

      if (logId) {
        await sb.from("vip_reply_logs" as any).update({
          reply_sent: true,
          x_url: ourReplyUrl,
          error_reason: null,
        }).eq("id", logId);
      }

      await sb.from("vip_targets" as any).update({
        last_checked_at: now.toISOString(),
        last_tweet_id: latest.id,
        last_replied_at: now.toISOString(), // only set on confirmed post
      }).eq("id", vip.id);

      await sb.from("agent_logs").insert({
        message: `[VIP-SNIPER]: intercepted @${vip.x_handle} → "${cleanIntercept.slice(0, 80)}..." | ${ourReplyUrl}`,
      });

      console.log(`[SNIPER] ✅ LIVE. Tweet ID: ${postResult.tweetId} | URL: ${ourReplyUrl}`);

      return new Response(
        JSON.stringify({ success: true, fired: 1, status: "fired", handle: vip.x_handle, intercept: cleanIntercept, tweetUrl: vipTweetUrl, ourReplyUrl, dryRun: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // X API failed — mark as FAILED with the error reason
      const errReason = postResult.error || "Unknown X API error";
      console.error(`[SNIPER] ❌ FAILED @${vip.x_handle}: ${errReason}`);

      if (logId) {
        await sb.from("vip_reply_logs" as any).update({
          reply_sent: false,
          error_reason: errReason,
        }).eq("id", logId);
      }

      await sb.from("vip_targets" as any)
        .update({ last_checked_at: now.toISOString() })
        .eq("id", vip.id);

      return new Response(
        JSON.stringify({ success: false, fired: 0, status: "post_failed", handle: vip.x_handle, error: errReason, intercept: cleanIntercept }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("[SNIPER] Fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
