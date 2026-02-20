/**
 * social-pulse — Autonomous social engine (30-45 min cron)
 * Weighted random: 40% follow, 40% like, 20% idle
 * Enforces daily quotas: 10-15 follows, 20-30 likes
 * Manual targets are prioritized over discovery targets
 * Uses Gemini-Flash to filter post quality before liking
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Daily quota limits ───
const FOLLOW_MIN = 10;
const FOLLOW_MAX = 15;
const LIKE_MIN = 20;
const LIKE_MAX = 30;

// ─── Weighted action picker (goal-driven: fill quota first) ───
function pickAction(followsRemaining: number, likesRemaining: number): "idle" | "like" | "follow" {
  const canFollow = followsRemaining > 0;
  const canLike = likesRemaining > 0;

  if (!canFollow && !canLike) return "idle";

  const r = Math.random();

  // 40% follow, 40% like, 20% idle — but only pick an action if quota remains
  if (r < 0.40) return canFollow ? "follow" : (canLike ? "like" : "idle");
  if (r < 0.80) return canLike ? "like" : (canFollow ? "follow" : "idle");
  return "idle"; // 20% idle
}

// ─── OAuth helpers (shared across auto-follow/execute-social-action) ───
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

async function followUser(sourceUserId: string, targetUserId: string): Promise<{ success: boolean; errorDetail?: string }> {
  let resp: Response;
  try {
    resp = await makeOAuthRequest(
      `https://api.x.com/2/users/${sourceUserId}/following`, "POST",
      JSON.stringify({ target_user_id: targetUserId })
    );
  } catch (fetchErr) {
    return { success: false, errorDetail: `Network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}` };
  }

  if (resp.ok) return { success: true };

  // Try to extract the exact X API error message
  const rawText = await resp.text().catch(() => "");
  let detail = `HTTP ${resp.status}`;
  try {
    const parsed = JSON.parse(rawText);
    // X API v2 error formats
    if (parsed?.detail) detail = `HTTP ${resp.status}: ${parsed.detail}`;
    else if (parsed?.errors?.[0]?.message) detail = `HTTP ${resp.status}: ${parsed.errors[0].message}`;
    else if (parsed?.title) detail = `HTTP ${resp.status}: ${parsed.title}`;
    else if (parsed?.error) detail = `HTTP ${resp.status}: ${parsed.error}`;
    else detail = `HTTP ${resp.status}: ${rawText.slice(0, 400)}`;
  } catch {
    detail = `HTTP ${resp.status}: ${rawText.slice(0, 400)}`;
  }

  // Map common codes to human-readable causes
  if (resp.status === 403) detail += " — likely missing 'follows.write' permission on your X app (check app settings → User auth → Read+Write+DMs)";
  if (resp.status === 401) detail += " — OAuth credentials invalid or expired";
  if (resp.status === 429) detail += " — X API rate limit hit, try again later";

  return { success: false, errorDetail: detail };
}

async function getLatestTweetFromUser(userId: string): Promise<{ id: string; text: string } | null> {
  const baseUrl = `https://api.x.com/2/users/${userId}/tweets`;
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const qParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
    max_results: "5", exclude: "retweets,replies",
    "tweet.fields": "text",
  };
  const signature = await generateOAuthSignature("GET", baseUrl, qParams, consumerSecret, accessTokenSecret);
  const authOnlyParams = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: timestamp,
    oauth_token: accessToken, oauth_version: "1.0",
    oauth_signature: signature,
  };
  const authHeader = "OAuth " + Object.keys(authOnlyParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(authOnlyParams[k as keyof typeof authOnlyParams])}"`).join(", ");
  const url = `${baseUrl}?max_results=5&exclude=retweets,replies&tweet.fields=text`;
  const resp = await fetch(url, { headers: { Authorization: authHeader } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const tweet = data.data?.[0];
  return tweet ? { id: tweet.id, text: tweet.text } : null;
}

async function likeTweet(userId: string, tweetId: string): Promise<boolean> {
  const resp = await makeOAuthRequest(
    `https://api.x.com/2/users/${userId}/likes`, "POST",
    JSON.stringify({ tweet_id: tweetId })
  );
  return resp.ok;
}

// ─── Gemini quality filter ───
async function isTweetHighQuality(tweetText: string, LOVABLE_API_KEY: string): Promise<{ quality: boolean; reason: string }> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content: `You are a quality filter for a crypto AI agent's social feed. 
Decide if a tweet is worth liking based on HustleCore's persona: crypto strategy, AI agents, Base network, Virtuals.io, DeFi, market analysis, or thought leadership.
SKIP: airdrop spam, "giveaway", "follow to win", NFT mint spam, explicit scam signals, low-effort "gm" only posts, random memes with no insight.
LIKE: market analysis, interesting DeFi or AI agent takes, Base/Solana ecosystem news, technical crypto insights, influential accounts in the space.
Respond with JSON only: {"quality": true/false, "reason": "brief reason max 8 words"}`
          },
          { role: "user", content: `Tweet: "${tweetText.slice(0, 280)}"` },
        ],
      }),
    });
    if (!resp.ok) return { quality: true, reason: "filter unavailable" };
    const d = await resp.json();
    const text = d.choices?.[0]?.message?.content?.trim() || "{}";
    // Strip markdown code fences if present
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { quality: !!parsed.quality, reason: parsed.reason || "quality check" };
  } catch {
    return { quality: true, reason: "filter error, defaulting to like" };
  }
}

// ─── Discovery: find new targets via Tavily ───
async function discoverNewTargets(sb: any, LOVABLE_API_KEY: string): Promise<string[]> {
  const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
  if (!TAVILY_API_KEY || !LOVABLE_API_KEY) return [];

  const queries = [
    "Trending Crypto VCs on Base network Twitter handles 2026",
    "Top AI Agent influencers crypto Twitter X accounts 2026",
    "Active Solana traders influencers Twitter handles",
    "New Virtuals Protocol launches AI agents X Twitter",
  ];

  const results: string[] = [];
  for (const query of queries.slice(0, 2)) { // limit to 2 queries to stay fast
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 4, include_answer: true }),
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        if (data.answer) results.push(data.answer);
        for (const r of (data.results || []).slice(0, 2)) {
          results.push(`${r.title}: ${r.content?.slice(0, 200) || ""}`);
        }
      }
    } catch { /* timeout or network error, skip */ }
  }

  if (results.length === 0) return [];

  // Gemini extracts handles with category classification
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are a crypto social intelligence analyst. Extract up to 8 X/Twitter handles from the search data below. Prioritize: Investors/VCs, AI Agent projects, Base network builders, Crypto influencers. Return ONLY valid handles (letters, numbers, underscores, 4-15 chars). One per line, no @ symbol, no explanations.`,
          },
          { role: "user", content: results.join("\n\n").slice(0, 2000) },
        ],
      }),
    });
    if (!resp.ok) return [];
    const d = await resp.json();
    const text = d.choices?.[0]?.message?.content?.trim() || "";
    return text
      .split("\n")
      .map((l: string) => l.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").trim())
      .filter((h: string) => h.length >= 4 && h.length <= 15)
      .slice(0, 8);
  } catch {
    return [];
  }
}

// ─── Get/upsert today's quota row ───
async function getTodayQuota(sb: any): Promise<{ follows_count: number; likes_count: number; follows_limit: number; likes_limit: number; id: string }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await sb.from("daily_social_quota").select("*").eq("date", today).maybeSingle();
  if (data) return data;
  // Create today's row with randomized limits in range
  const followsLimit = FOLLOW_MIN + Math.floor(Math.random() * (FOLLOW_MAX - FOLLOW_MIN + 1));
  const likesLimit = LIKE_MIN + Math.floor(Math.random() * (LIKE_MAX - LIKE_MIN + 1));
  const { data: inserted } = await sb.from("daily_social_quota").insert({
    date: today,
    follows_count: 0,
    likes_count: 0,
    follows_limit: followsLimit,
    likes_limit: likesLimit,
  }).select().single();
  return inserted || { follows_count: 0, likes_count: 0, follows_limit: followsLimit, likes_limit: likesLimit, id: "new" };
}

async function incrementQuota(sb: any, quotaId: string, field: "follows_count" | "likes_count", current: number) {
  await sb.from("daily_social_quota").update({ [field]: current + 1, updated_at: new Date().toISOString() }).eq("id", quotaId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Check if this is a force-follow request
    let body: { forceFollow?: boolean } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const isForceFollow = body?.forceFollow === true;

    // ─── STEP 1: Check daily quota first (quota-aware action picking) ───
    const quota = await getTodayQuota(sb);
    const followsRemaining = quota.follows_limit - quota.follows_count;
    const likesRemaining = quota.likes_limit - quota.likes_count;

    // For force-follow, skip the random roll and go straight to follow
    const action = isForceFollow ? "follow" : pickAction(followsRemaining, likesRemaining);
    console.log(`[PULSE] Action: ${action.toUpperCase()} | Follows left: ${followsRemaining} | Likes left: ${likesRemaining}${isForceFollow ? " | FORCE MODE" : ""}`);

    if (action === "idle") {
      console.log("[PULSE] Idling this cycle.");
      // Log the idle cycle so admins can see the function fired
      await sb.from("agent_logs").insert({
        message: `[SYSTEM]: Neural rest cycle. No actions taken. (follows: ${quota.follows_count}/${quota.follows_limit}, likes: ${quota.likes_count}/${quota.likes_limit})`,
      }).catch(() => {});
      return new Response(JSON.stringify({ action: "idle", reason: "20% idle probability or quotas full" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
    if (!hasKeys) throw new Error("X API credentials not configured");

    const myUserId = await getAuthenticatedUserId();
    if (!myUserId) throw new Error("Failed to get X user ID");

    // ─── STEP 2: FOLLOW action ───
    if (action === "follow") {
      if (!isForceFollow && followsRemaining <= 0) {
        // Quota hit, fall through to like
        console.log(`[PULSE] Follow quota full (${quota.follows_count}/${quota.follows_limit}), falling back to like.`);
      } else {
        // Priority 1: Manual targets (any source != 'discovery')
        const { data: manualTargets } = await sb
          .from("target_agents")
          .select("*")
          .eq("auto_follow", true)
          .eq("is_active", true)
          .is("followed_at", null)
          .neq("source", "discovery")
          .order("priority", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1);

        let target = manualTargets?.[0];

        // Priority 2: Discovery targets
        if (!target) {
          const { data: discoveryTargets } = await sb
            .from("target_agents")
            .select("*")
            .eq("auto_follow", true)
            .eq("is_active", true)
            .is("followed_at", null)
            .eq("source", "discovery")
            .order("priority", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(1);
          target = discoveryTargets?.[0];
        }

        // Priority 3: Discover new targets if list empty
        if (!target && LOVABLE_API_KEY) {
          console.log("[PULSE] No targets, triggering discovery...");
          const discovered = await discoverNewTargets(sb, LOVABLE_API_KEY);
          if (discovered.length > 0) {
            const { data: existing } = await sb.from("target_agents").select("x_handle");
            const existingSet = new Set((existing || []).map((t: any) => t.x_handle.toLowerCase()));
            const newHandles = discovered.filter((h) => !existingSet.has(h.toLowerCase()));
            for (const handle of newHandles) {
              await sb.from("target_agents").insert({ x_handle: handle, auto_follow: true, source: "discovery", priority: 10 });
            }
            if (newHandles.length > 0) {
              await sb.from("agent_logs").insert({
                message: `[DISCOVERY]: Found ${newHandles.length} new targets via Pulse: ${newHandles.map(h => `@${h}`).join(", ")}`,
              });
              const { data: refreshed } = await sb.from("target_agents").select("*").eq("auto_follow", true).eq("is_active", true).is("followed_at", null).order("priority", { ascending: true }).limit(1);
              target = refreshed?.[0];
            }
          }
        }

        if (!target) {
          console.log("[PULSE] No follow target available.");
          return new Response(JSON.stringify({ action: "idle", reason: "no targets available" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const targetUserId = await lookupUserByHandle(target.x_handle);
        if (!targetUserId) {
          const errMsg = `[PULSE ERROR]: @${target.x_handle} — X lookup failed (handle may be invalid/suspended)`;
          console.warn(errMsg);
          await sb.from("agent_logs").insert({ message: errMsg }).catch(() => {});
          return new Response(JSON.stringify({ action: "skipped", reason: `handle not found: @${target.x_handle}` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const followResult = await followUser(myUserId, targetUserId);
        if (followResult.success) {
          const reason = `targeted ${target.source === "discovery" ? "discovered" : "manual"} account for network growth`;
          await Promise.all([
            sb.from("target_agents").update({ followed_at: new Date().toISOString() }).eq("id", target.id),
            sb.from("social_logs").insert({
              target_handle: target.x_handle,
              action_type: "follow",
              source: isForceFollow ? "force_follow" : "auto_pulse",
              reason,
            }),
            sb.from("agent_logs").insert({
              message: `[PULSE FOLLOW]: @${target.x_handle} — ${reason} (${isForceFollow ? "FORCE" : "AUTO"})`,
            }),
            incrementQuota(sb, quota.id, "follows_count", quota.follows_count),
          ]);
          console.log(`[PULSE] Followed @${target.x_handle}. Quota: ${quota.follows_count + 1}/${quota.follows_limit}`);
          return new Response(JSON.stringify({ action: "follow", target: target.x_handle, reason, quota: { follows: quota.follows_count + 1, followsLimit: quota.follows_limit } }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          // Log EXACT X API error for full transparency — visible in SOCIAL ACTIVITY
          const shortError = (followResult.errorDetail || "unknown error").slice(0, 500);
          const errMsg = `[X API ERROR]: Follow @${target.x_handle} FAILED — ${shortError}`;
          console.error(errMsg);
          await sb.from("agent_logs").insert({ message: errMsg }).catch(() => {});
          await sb.from("social_logs").insert({
            target_handle: target.x_handle,
            action_type: "follow_error",
            source: isForceFollow ? "force_follow" : "auto_pulse",
            reason: shortError.slice(0, 200),
          }).catch(() => {});
          return new Response(JSON.stringify({ action: "error", target: target.x_handle, reason: shortError }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 so frontend can read the body and show the real error
          });
        }
      }
    }

    // ─── STEP 3: LIKE action ───
    if (likesRemaining <= 0) {
      console.log(`[PULSE] Like quota full (${quota.likes_count}/${quota.likes_limit}). Idling.`);
      await sb.from("agent_logs").insert({
        message: `[SYSTEM]: Neural rest cycle. No actions taken. (follows: ${quota.follows_count}/${quota.follows_limit}, likes: ${quota.likes_count}/${quota.likes_limit})`,
      }).catch(() => {});
      return new Response(JSON.stringify({ action: "idle", reason: "daily like quota reached" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: likeTargets } = await sb
      .from("target_agents")
      .select("*")
      .eq("is_active", true)
      .order("last_roasted_at", { ascending: true, nullsFirst: true })
      .limit(10);

    if (!likeTargets || likeTargets.length === 0) {
      console.log("[PULSE] No like targets available.");
      return new Response(JSON.stringify({ action: "idle", reason: "no like targets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const likeTarget = likeTargets[Math.floor(Math.random() * likeTargets.length)];
    const likeUserId = await lookupUserByHandle(likeTarget.x_handle);
    if (!likeUserId) {
      return new Response(JSON.stringify({ action: "skipped", reason: `user not found: @${likeTarget.x_handle}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latestTweet = await getLatestTweetFromUser(likeUserId);
    if (!latestTweet) {
      return new Response(JSON.stringify({ action: "skipped", reason: `no tweets from @${likeTarget.x_handle}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quality check with Gemini
    let qualityResult = { quality: true, reason: "quality check skipped" };
    if (LOVABLE_API_KEY) {
      qualityResult = await isTweetHighQuality(latestTweet.text, LOVABLE_API_KEY);
    }

    if (!qualityResult.quality) {
      console.log(`[PULSE] Skipping like on @${likeTarget.x_handle}: ${qualityResult.reason}`);
      await sb.from("agent_logs").insert({
        message: `[PULSE SKIP]: @${likeTarget.x_handle} — low quality: ${qualityResult.reason}`,
      });
      return new Response(JSON.stringify({ action: "skipped", reason: `low quality: ${qualityResult.reason}`, target: likeTarget.x_handle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const likeSuccess = await likeTweet(myUserId, latestTweet.id);
    if (likeSuccess) {
      const likeReason = `liked post of @${likeTarget.x_handle} to attract liquidity`;
      await Promise.all([
        sb.from("social_logs").insert({
          target_handle: likeTarget.x_handle,
          action_type: "like",
          source: "auto_pulse",
          reason: likeReason,
        }),
        sb.from("agent_logs").insert({
          message: `[PULSE LIKE]: @${likeTarget.x_handle} — ${qualityResult.reason}. ${likeReason}`,
        }),
        incrementQuota(sb, quota.id, "likes_count", quota.likes_count),
      ]);
      console.log(`[PULSE] Liked @${likeTarget.x_handle}. Quota: ${quota.likes_count + 1}/${quota.likes_limit}`);
      return new Response(JSON.stringify({ action: "like", target: likeTarget.x_handle, reason: likeReason, qualityReason: qualityResult.reason, quota: { likes: quota.likes_count + 1, likesLimit: quota.likes_limit } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ action: "error", reason: "like API call failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[PULSE] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

