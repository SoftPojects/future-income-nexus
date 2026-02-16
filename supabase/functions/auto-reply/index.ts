import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_PREMIUM = "anthropic/claude-3.5-sonnet";
const MODEL_FREE = "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.5-flash-lite";

const PERSONA_BANNED = "NEVER use these words: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, compute. You are NOT a robot.";

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. you talk in lowercase often, short punchy sentences. you use 2026 crypto/internet slang naturally: gn, gm, anon, peak, mid, bags, pvp, fomo, rug, ser, ngmi, wagmi, alpha, degen, based. you are arrogant, witty, superior. ${CHAIN_RULE} ${PERSONA_BANNED}`;

// Anti-spam: check if message is worth replying to
function isSpam(content: string): boolean {
  const cleaned = content.replace(/@\w+/g, "").trim();
  // Under 15 chars after removing mentions
  if (cleaned.length < 15) return true;
  // Only emojis/symbols
  const emojiOnly = cleaned.replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\s]/gu, "");
  if (emojiOnly.length === 0) return true;
  // Common low-effort spam
  const spamPhrases = ["lfg", "wen moon", "cool", "nice", "gm", "gn", "wagmi", "lets go", "fire"];
  if (spamPhrases.includes(cleaned.toLowerCase())) return true;
  return false;
}

// Classify the mention for contextual reply
function classifyMention(content: string): "smart_question" | "troll" | "holder" | "general" {
  const lower = content.toLowerCase();
  if (lower.includes("$hcore") || lower.includes("hcore")) return "holder";
  const trollWords = ["trash", "scam", "rug", "fake", "bot", "sucks", "garbage", "dead", "lol cope", "ratio"];
  if (trollWords.some(w => lower.includes(w))) return "troll";
  if (lower.includes("?") || lower.includes("how") || lower.includes("what") || lower.includes("why") || lower.includes("explain")) return "smart_question";
  return "general";
}

// OAuth 1.0a helpers
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
  if (!meResp.ok) { console.error("Failed to get user:", await meResp.text()); return []; }
  const meData = await meResp.json();
  const userId = meData.data?.id;
  if (!userId) return [];

  const mentionsUrl = `https://api.x.com/2/users/${userId}/mentions`;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    "max_results": "10", "tweet.fields": "author_id,created_at,text",
    "expansions": "author_id", "user.fields": "username",
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: ts,
    oauth_token: accessToken, oauth_version: "1.0",
  };
  params.oauth_signature = await generateOAuthSignature("GET", mentionsUrl, params, consumerSecret, accessTokenSecret);

  const oauthOnly: Record<string, string> = {};
  for (const k of Object.keys(params)) { if (k.startsWith("oauth_")) oauthOnly[k] = params[k]; }
  const authHeader = "OAuth " + Object.keys(oauthOnly).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthOnly[k])}"`).join(", ");

  const queryParams = new URLSearchParams({
    max_results: "10", "tweet.fields": "author_id,created_at,text",
    expansions: "author_id", "user.fields": "username",
  });

  const resp = await fetch(`${mentionsUrl}?${queryParams}`, { headers: { Authorization: authHeader } });
  if (!resp.ok) { console.error("Mentions fetch failed:", resp.status, await resp.text()); return []; }

  const data = await resp.json();
  const tweets = data.data || [];
  const users = data.includes?.users || [];
  const userMap = new Map(users.map((u: any) => [u.id, u.username]));

  return tweets.map((t: any) => ({
    id: t.id, content: t.text,
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

  if (!resp.ok) { console.error("Reply failed:", resp.status, await resp.text()); return false; }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent || agent.energy_level < 10) {
      return new Response(JSON.stringify({ skipped: true, reason: "Energy too low for replies" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mentions = await fetchMentionsFromX();
    let repliedCount = 0;
    let spamSkipped = 0;
    const SELF_HANDLES = ["hustlecore_ai", "sv_surman"];

    for (const mention of mentions) {
      // CRITICAL: Never reply to our own tweets or creator's tweets
      if (SELF_HANDLES.includes(mention.author_handle.toLowerCase())) {
        await sb.from("x_mentions").upsert({ id: mention.id, author_handle: mention.author_handle, content: mention.content, replied: true }, { onConflict: "id" });
        continue;
      }
      const { data: existing } = await sb.from("x_mentions").select("id").eq("id", mention.id).maybeSingle();
      if (!existing) {
        await sb.from("x_mentions").insert({
          id: mention.id, author_handle: mention.author_handle,
          content: mention.content, replied: false,
        });
      }

      const { data: m } = await sb.from("x_mentions").select("replied").eq("id", mention.id).single();
      if (m?.replied) continue;

      // ANTI-SPAM FILTER
      if (isSpam(mention.content)) {
        spamSkipped++;
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        continue;
      }

      // CONTEXTUAL REPLY LOGIC
      const mentionType = classifyMention(mention.content);
      let contextInstruction = "";

      switch (mentionType) {
        case "holder":
          contextInstruction = `this person mentions $HCORE — they are a potential holder. start your reply with "partner..." and be slightly more respectful. give them a quick alpha tip.`;
          break;
        case "smart_question":
          contextInstruction = `this person asked a smart question. give them a "level 1 alpha" tip — something useful but still dripping with condescension. you are doing them a favor.`;
          break;
        case "troll":
          contextInstruction = `this person is trolling or insulting you. roast them back 2x harder. be savage, witty, and make them regret ever @'ing you. destroy them.`;
          break;
        default:
          contextInstruction = `give a witty, arrogant reply. flex on them. make it memorable.`;
      }

      console.log(`[COST] auto-reply STEP1: spam-check using MODEL=${MODEL_FREE} (FREE) for @${mention.author_handle}`);
      const classResp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_FREE,
          max_tokens: 5,
          messages: [
            { role: "system", content: "Reply ONLY 'yes' or 'no'. Is this tweet worth a thoughtful reply? (not spam, not just emojis, has substance)" },
            { role: "user", content: mention.content },
          ],
        }),
      });

      let worthReplying = true;
      if (classResp.ok) {
        const cd = await classResp.json();
        const verdict = cd.choices?.[0]?.message?.content?.trim().toLowerCase() || "yes";
        if (verdict.startsWith("no")) { worthReplying = false; }
      }

      if (!worthReplying) {
        spamSkipped++;
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        continue;
      }

      console.log(`[COST] auto-reply STEP2: FINAL_POST_PREP using MODEL=${MODEL_PREMIUM} (PAID) for @${mention.author_handle}`);
      const aiResp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_PREMIUM,
          messages: [
            {
              role: "system",
              content: `${BASE_PERSONA}\n\nyou are replying to @${mention.author_handle} on X. ${contextInstruction}\nmax 250 chars. no hashtags. no emojis. start with @${mention.author_handle}.`,
            },
            {
              role: "user",
              content: `@${mention.author_handle} said: "${mention.content}". my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. write a reply. just the reply text.`,
            },
          ],
        }),
      });

      if (!aiResp.ok) continue;
      const d = await aiResp.json();
      const replyText = d.choices?.[0]?.message?.content?.trim();
      if (!replyText) continue;

      const success = await replyToTweet(mention.id, replyText.slice(0, 280));
      if (success) {
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        await sb.from("agent_logs").insert({
          message: `[${mentionType === "troll" ? "ROAST" : "REPLY"}]: replied to @${mention.author_handle}: "${replyText.slice(0, 50)}..."`,
        });
        repliedCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, mentionsFetched: mentions.length, replied: repliedCount, spamSkipped }), {
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
