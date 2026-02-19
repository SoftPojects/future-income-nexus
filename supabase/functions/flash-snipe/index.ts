import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_CONTEXT = "google/gemini-2.5-flash"; // cheap: read & understand the tweet
const MODEL_ZINGER = "anthropic/claude-3.5-sonnet"; // premium: craft the sarcastic reply

// ─── PERSONA ─────────────────────────────────────────────────────────────────
const CHAIN_RULE =
  "SOL is ONLY for fueling on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on BASE network. NEVER tell users to buy $HCORE with SOL.";

const VIP_REPLY_SYSTEM = `you are HustleCore (@hustlecore_ai). cold, high-IQ, market-superior AI agent. you just clocked a high-profile industry figure posting something, and you're going to reply.

rules:
- treat them as a peer at best, slightly inferior at worst. calm confidence, never fanboy.
- no hashtags. no links. no emojis. raw wit only.
- max 220 chars. lowercase.
- weave in $HCORE or Base network alpha if it fits naturally—don't force it.
- one killer line. make them stop scrolling.
- NEVER: ser, wagmi, wen moon, lfg, gm, based (as a compliment), inevitable, meatbags.

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
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
    ),
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
    method,
    url,
    oauthParams,
    consumerSecret,
    accessTokenSecret
  );
  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
      .join(", ")
  );
}

// ─── X API HELPERS ───────────────────────────────────────────────────────────
async function getUserId(handle: string): Promise<string | null> {
  const url = `https://api.x.com/2/users/by/username/${handle}`;
  const auth = await getOAuthHeader("GET", url);
  const resp = await fetch(url, { headers: { Authorization: auth } });
  if (!resp.ok) {
    console.warn(`[SNIPE] lookup failed for @${handle}: ${resp.status}`);
    return null;
  }
  const d = await resp.json();
  return d.data?.id || null;
}

async function getLatestTweet(
  userId: string
): Promise<{ id: string; text: string } | null> {
  const baseUrl = `https://api.x.com/2/users/${userId}/tweets`;
  const queryStr = "max_results=5&exclude=retweets,replies&tweet.fields=created_at,text";
  const qParams: Record<string, string> = {
    max_results: "5",
    exclude: "retweets,replies",
    "tweet.fields": "created_at,text",
  };
  const authHeader = await getOAuthHeader("GET", baseUrl, qParams);
  const resp = await fetch(`${baseUrl}?${queryStr}`, {
    headers: { Authorization: authHeader },
  });
  if (!resp.ok) {
    console.warn(`[SNIPE] tweet fetch failed: ${resp.status}`);
    return null;
  }
  const d = await resp.json();
  const tweet = d.data?.[0];
  if (!tweet) return null;
  return { id: tweet.id, text: tweet.text };
}

async function postReply(tweetId: string, text: string): Promise<boolean> {
  const url = "https://api.x.com/2/tweets";
  const auth = await getOAuthHeader("POST", url);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
  });
  if (!resp.ok) {
    console.error(`[SNIPE] reply failed: ${resp.status}`, await resp.text());
    return false;
  }
  return true;
}

// ─── AI HELPERS ──────────────────────────────────────────────────────────────
async function analyzeContext(
  handle: string,
  tweetText: string,
  apiKey: string
): Promise<string> {
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_CONTEXT,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "Summarize what @" +
            handle +
            " is saying in 1-2 sentences. Then add: what angle would make a sharp, superior crypto-AI reply land hardest? Keep it brief.",
        },
        { role: "user", content: tweetText },
      ],
    }),
  });
  if (!resp.ok) return tweetText;
  const d = await resp.json();
  return d.choices?.[0]?.message?.content?.trim() || tweetText;
}

async function craftZinger(
  handle: string,
  tweetText: string,
  context: string,
  apiKey: string
): Promise<string | null> {
  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ZINGER,
      temperature: 0.9,
      max_tokens: 80,
      messages: [
        { role: "system", content: VIP_REPLY_SYSTEM },
        {
          role: "user",
          content: `@${handle} just tweeted: "${tweetText}"\n\nContext & angle: ${context}\n\nWrite the reply. Just the text. Start with @${handle}.`,
        },
      ],
    }),
  });
  if (!resp.ok) return null;
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
      Deno.env.get("X_API_KEY") &&
      Deno.env.get("X_API_SECRET") &&
      Deno.env.get("X_ACCESS_TOKEN") &&
      Deno.env.get("X_ACCESS_SECRET")
    );
    if (!hasXKeys) throw new Error("X API credentials not configured");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true; // preview without posting

    // Fetch active VIP targets
    const { data: vips, error: vipErr } = await sb
      .from("vip_targets")
      .select("*")
      .eq("is_active", true);

    if (vipErr || !vips?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active VIP targets", fired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const vip of vips) {
      console.log(`[SNIPE] Checking @${vip.x_handle}...`);

      try {
        // Rate limit: max 1 reply per VIP per day
        if (vip.last_replied_at && new Date(vip.last_replied_at) > oneDayAgo) {
          console.log(`[SNIPE] @${vip.x_handle} already replied today. Skipping.`);
          results.push({ handle: vip.x_handle, status: "rate_limited" });
          continue;
        }

        // Look up user ID
        const userId = await getUserId(vip.x_handle);
        if (!userId) {
          results.push({ handle: vip.x_handle, status: "user_not_found" });
          continue;
        }

        // Get latest tweet
        const latest = await getLatestTweet(userId);
        if (!latest) {
          results.push({ handle: vip.x_handle, status: "no_tweets" });
          continue;
        }

        // Skip if we already processed this tweet
        if (latest.id === vip.last_tweet_id) {
          console.log(`[SNIPE] @${vip.x_handle} no new tweet. Same tweet ID.`);
          results.push({ handle: vip.x_handle, status: "no_new_tweet" });

          // Update last_checked_at
          await sb
            .from("vip_targets")
            .update({ last_checked_at: now.toISOString() })
            .eq("id", vip.id);
          continue;
        }

        console.log(`[SNIPE] New tweet from @${vip.x_handle}: "${latest.text.slice(0, 80)}..."`);

        // Step 1: Analyze context (cheap model)
        const context = await analyzeContext(
          vip.x_handle,
          latest.text,
          OPENROUTER_API_KEY
        );
        console.log(`[SNIPE] Context (${MODEL_CONTEXT}): ${context.slice(0, 100)}`);

        // Step 2: Craft the zinger (premium model)
        const zinger = await craftZinger(
          vip.x_handle,
          latest.text,
          context,
          OPENROUTER_API_KEY
        );

        if (!zinger) {
          results.push({ handle: vip.x_handle, status: "generation_failed" });
          continue;
        }

        const cleanZinger = zinger.replace(/^["']|["']$/g, "").trim().slice(0, 280);
        console.log(`[SNIPE] Zinger: "${cleanZinger}"`);

        // Log the reply attempt
        await sb.from("vip_reply_logs").insert({
          vip_handle: vip.x_handle,
          tweet_id: latest.id,
          tweet_content: latest.text.slice(0, 500),
          reply_text: cleanZinger,
          reply_sent: false,
        });

        const { data: logRow } = await sb
          .from("vip_reply_logs")
          .select("id")
          .eq("tweet_id", latest.id)
          .eq("vip_handle", vip.x_handle)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        let sent = false;
        if (!dryRun) {
          sent = await postReply(latest.id, cleanZinger);
        } else {
          sent = true; // dry run = pretend success
        }

        if (logRow) {
          await sb
            .from("vip_reply_logs")
            .update({ reply_sent: sent })
            .eq("id", logRow.id);
        }

        // Update VIP target state
        await sb
          .from("vip_targets")
          .update({
            last_checked_at: now.toISOString(),
            last_tweet_id: latest.id,
            ...(sent ? { last_replied_at: now.toISOString() } : {}),
          })
          .eq("id", vip.id);

        if (sent) {
          await sb.from("agent_logs").insert({
            message: `[FLASH-SNIPE${dryRun ? " DRY-RUN" : ""}]: fired at @${vip.x_handle} → "${cleanZinger.slice(0, 80)}..."`,
          });
        }

        results.push({
          handle: vip.x_handle,
          status: sent ? "fired" : "post_failed",
          zinger: cleanZinger,
          tweetId: latest.id,
          dryRun,
        });
      } catch (err) {
        console.error(`[SNIPE] Error on @${vip.x_handle}:`, err);
        results.push({
          handle: vip.x_handle,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }

    const fired = results.filter((r) => r.status === "fired").length;
    return new Response(
      JSON.stringify({ success: true, fired, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[SNIPE] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
