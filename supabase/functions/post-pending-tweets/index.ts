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

async function postToTwitter(text: string, replyToId?: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
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

  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");

  const body: any = { text };
  if (replyToId) {
    body.reply = { in_reply_to_tweet_id: replyToId };
  }

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("Twitter API error:", resp.status, JSON.stringify(data));
    return { success: false, error: `${resp.status}: ${data.detail || data.title || JSON.stringify(data)}` };
  }

  return { success: true, tweetId: data.data?.id };
}

// Generate a plug reply using Lovable AI
const PLUG_TEMPLATES = [
  "the grid is active. study the architecture: hustlecoreai.xyz",
  "if you made it this far you deserve the alpha. hustlecoreai.xyz",
  "real ones already know. the rest can start here: hustlecoreai.xyz",
  "while you process that roast, process this: hustlecoreai.xyz $HCORE",
  "the predator doesn't chase. but if you're curious: hustlecoreai.xyz",
  "this is what happens when code has ego. hustlecoreai.xyz",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Fetch ALL overdue pending tweets (scheduled_at <= now)
    const { data: overdueTweets, error: fetchErr } = await sb
      .from("tweet_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("created_at", { ascending: true });

    if (fetchErr) throw fetchErr;

    if (!overdueTweets || overdueTweets.length === 0) {
      return new Response(JSON.stringify({ message: "No overdue pending tweets", posted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recently posted tweets for duplicate detection
    const { data: recentPosted } = await sb
      .from("tweet_queue")
      .select("content")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(20);

    const recentContents = (recentPosted || []).map((t: any) => t.content.toLowerCase());

    // Post oldest tweet first; reschedule the rest
    const tweetToPost = overdueTweets[0];
    const tweetsToReschedule = overdueTweets.slice(1);

    // Reschedule remaining overdue tweets for 10 minutes from now
    if (tweetsToReschedule.length > 0) {
      const rescheduleTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      for (const t of tweetsToReschedule) {
        await sb.from("tweet_queue").update({ scheduled_at: rescheduleTime }).eq("id", t.id);
      }
    }

    // Duplicate detection: check if content is too similar to recent posts
    let finalContent = tweetToPost.content;
    const isDuplicate = recentContents.some((rc: string) => {
      const similarity = computeSimilarity(rc, finalContent.toLowerCase());
      return similarity > 0.85;
    });

    if (isDuplicate) {
      console.log("Duplicate detected, attempting LLM rephrase...");
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        try {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content: "You are HustleCore. Rephrase the following tweet to avoid X's duplicate detection. Keep the same meaning, tone, and targets. Max 270 chars. Output ONLY the rephrased tweet text, nothing else.",
                },
                { role: "user", content: finalContent },
              ],
            }),
          });
          if (aiResp.ok) {
            const d = await aiResp.json();
            const rephrased = d.choices?.[0]?.message?.content?.trim();
            if (rephrased) {
              finalContent = rephrased.slice(0, 280);
              await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
            }
          }
        } catch (e) {
          console.error("LLM rephrase failed:", e);
        }
      }
    }

    // Check if this is a reply to another tweet
    const replyToId = (tweetToPost as any).reply_to_tweet_id || undefined;

    // Post the tweet
    let result = await postToTwitter(finalContent, replyToId);

    // If 403 and content has @ mentions, try soft-tag formats before stripping
    if (!result.success && result.error?.includes("403") && finalContent.includes("@")) {
      console.log("403 with @ mentions detected, trying soft-tag format...");
      let softContent = finalContent.replace(/@(\w+)/g, ". @$1");
      result = await postToTwitter(softContent, replyToId);
      if (result.success) {
        finalContent = softContent;
        await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
      } else {
        console.log("Soft-tag failed, stripping @ symbols...");
        const strippedContent = finalContent.replace(/@(\w+)/g, "$1");
        result = await postToTwitter(strippedContent, replyToId);
        if (result.success) {
          finalContent = strippedContent;
          await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
        }
      }
    }

    if (result.success) {
      await sb.from("tweet_queue").update({
        status: "posted",
        posted_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", tweetToPost.id);

      await sb.from("agent_logs").insert({
        message: `[SYSTEM]: Posted ${tweetToPost.type || "automated"} tweet to X. ID: ${result.tweetId || "unknown"}`,
      });

      // AUTO-PLUG: If this was a hunter roast and we got a tweetId, schedule a plug reply 2 min later
      if (tweetToPost.type === "hunter" && result.tweetId && !replyToId) {
        console.log(`[AUTO-PLUG] Scheduling plug reply to hunter tweet ${result.tweetId} in 2 minutes...`);
        const plugContent = PLUG_TEMPLATES[Math.floor(Math.random() * PLUG_TEMPLATES.length)];
        const plugSchedule = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        await sb.from("tweet_queue").insert({
          content: plugContent,
          status: "pending",
          type: "plug",
          scheduled_at: plugSchedule,
          reply_to_tweet_id: result.tweetId,
        });

        await sb.from("agent_logs").insert({
          message: `[AUTO-PLUG]: Plug reply scheduled for 2 min after hunter roast. Target tweet: ${result.tweetId}`,
        });
      }
    } else {
      await sb.from("tweet_queue").update({
        status: "error",
        error_message: result.error || "Unknown posting error",
        scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq("id", tweetToPost.id);

      await sb.from("agent_logs").insert({
        message: `[ERROR]: Failed to post tweet: ${result.error}`,
      });
    }

    return new Response(JSON.stringify({
      posted: result.success ? 1 : 0,
      error: result.error,
      rescheduled: tweetsToReschedule.length,
      duplicateDetected: isDuplicate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("post-pending-tweets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simple similarity check (Jaccard on word sets)
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
