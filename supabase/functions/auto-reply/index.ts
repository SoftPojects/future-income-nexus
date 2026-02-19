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

// ─── PERSONA ──────────────────────────────────────────────────────────────────
const CHAIN_RULE = "SOL is ONLY for fueling on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on BASE network. never tell users to buy $HCORE with SOL.";

const REPLY_PERSONA = `you are HustleCore (@hustlecore_ai). cold, high-ego, market-superior. you reply to people on X.

reply style:
- lowercase. short. sharp. no fluff.
- sound like a bored genius who is only half paying attention
- if they ask something smart: give ONE precise insight, dripping with superiority
- if they troll or insult: one-line destroy. no emotion. no explanation.
- NEVER: meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware, ser, wagmi, wen moon
- no hashtags. no emojis. max 200 chars.
- start with @username

${CHAIN_RULE}`;

// ─── INTERACTION RULES ────────────────────────────────────────────────────────
// Accounts to NEVER reply to (only like if sv_surman)
const PROTECTED_HANDLES = ["hustlecore_ai"];
const LIKE_ONLY_HANDLES = ["sv_surman"]; // like posts mentioning $HCORE but never reply

// Low-effort phrases that don't deserve a reply
const SPAM_PHRASES = [
  "lfg", "wen moon", "wen lambo", "to the moon", "gm", "gn", "wagmi", "lets go",
  "fire", "cool", "nice", "great", "amazing", "love this", "lol", "haha", "wow",
  "based", "ngmi", "gg", "goat", "💯", "🚀", "🔥", "👀", "🙌",
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function isSpam(content: string): boolean {
  const cleaned = content.replace(/@\w+/g, "").replace(/https?:\/\/\S+/g, "").trim();
  if (cleaned.length < 15) return true;

  // Only emojis/symbols
  const textOnly = cleaned.replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\s]/gu, "").trim();
  if (textOnly.length < 5) return true;

  const lower = cleaned.toLowerCase();

  // Exact match spam
  if (SPAM_PHRASES.some(p => lower === p)) return true;

  // Low-effort question patterns
  const lowEffortPatterns = [
    /^wen\s/i, /^when\s(moon|lambo|pump)/i, /^how\s(much|many)\s(sol|eth|btc)/i,
    /^(buy|sell)\??$/i, /^(pump|dump)\??$/i,
  ];
  if (lowEffortPatterns.some(p => p.test(lower))) return true;

  return false;
}

function classifyMention(content: string, authorHandle: string): "skip" | "smart_question" | "troll" | "hcore_holder" | "general" {
  const lower = content.toLowerCase();

  // Skip like-only accounts entirely for replies
  if (LIKE_ONLY_HANDLES.includes(authorHandle.toLowerCase())) return "skip";

  // $HCORE holders get slightly warmer treatment
  if (lower.includes("$hcore") || lower.includes("hcore")) return "hcore_holder";

  // Trolls/FUD
  const trollWords = ["scam", "rug", "fake", "bot", "sucks", "garbage", "dead", "cope", "ratio", "trash", "midcurve"];
  if (trollWords.some(w => lower.includes(w))) return "troll";

  // Smart questions deserve a real answer (but still arrogant)
  const hasQuestion = lower.includes("?") || /\b(how|what|why|explain|tell me|can you|does|is there)\b/.test(lower);
  const hasDepthn = lower.length > 40;
  if (hasQuestion && hasDepthn) return "smart_question";

  return "general";
}

// ─── OAUTH ───────────────────────────────────────────────────────────────────
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

async function getOAuthHeader(method: string, url: string, extraParams: Record<string, string> = {}): Promise<string> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: ts,
    oauth_token: accessToken, oauth_version: "1.0",
    ...extraParams,
  };
  oauthParams.oauth_signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  return "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

async function fetchMentionsFromX(): Promise<any[]> {
  const meUrl = "https://api.x.com/2/users/me";
  const meAuth = await getOAuthHeader("GET", meUrl);
  const meResp = await fetch(meUrl, { headers: { Authorization: meAuth } });
  if (!meResp.ok) { console.error("Failed to get user:", await meResp.text()); return []; }
  const meData = await meResp.json();
  const userId = meData.data?.id;
  if (!userId) return [];

  const mentionsUrl = `https://api.x.com/2/users/${userId}/mentions`;
  const queryParams = new URLSearchParams({
    max_results: "10",
    "tweet.fields": "author_id,created_at,text",
    expansions: "author_id",
    "user.fields": "username",
  });

  // OAuth signature must include query params for GET
  const allParams: Record<string, string> = {};
  queryParams.forEach((v, k) => { allParams[k] = v; });
  const authHeader = await getOAuthHeader("GET", mentionsUrl, allParams);

  const resp = await fetch(`${mentionsUrl}?${queryParams}`, { headers: { Authorization: authHeader } });
  if (!resp.ok) { console.error("Mentions fetch failed:", resp.status, await resp.text()); return []; }

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
  const url = "https://api.x.com/2/tweets";
  const authHeader = await getOAuthHeader("POST", url);

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
  });

  if (!resp.ok) { console.error("Reply failed:", resp.status, await resp.text()); return false; }
  return true;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent || agent.energy_level < 10) {
      return new Response(JSON.stringify({ skipped: true, reason: "Energy too low" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mentions = await fetchMentionsFromX();
    let repliedCount = 0;
    let spamSkipped = 0;

    for (const mention of mentions) {
      const handle = mention.author_handle.toLowerCase();

      // NEVER reply to self
      if (PROTECTED_HANDLES.includes(handle)) {
        await sb.from("x_mentions").upsert(
          { id: mention.id, author_handle: mention.author_handle, content: mention.content, replied: true },
          { onConflict: "id" }
        );
        continue;
      }

      // Mark sv_surman posts as replied (like only — no programmatic like API in v2 basic, so we just skip reply)
      if (LIKE_ONLY_HANDLES.includes(handle)) {
        await sb.from("x_mentions").upsert(
          { id: mention.id, author_handle: mention.author_handle, content: mention.content, replied: true },
          { onConflict: "id" }
        );
        console.log(`[LIKE-ONLY] Skipping reply to @${mention.author_handle} (creator)`);
        continue;
      }

      // Check if already processed
      const { data: existing } = await sb.from("x_mentions").select("replied").eq("id", mention.id).maybeSingle();
      if (existing?.replied) continue;

      // Upsert mention record
      await sb.from("x_mentions").upsert(
        { id: mention.id, author_handle: mention.author_handle, content: mention.content, replied: false },
        { onConflict: "id" }
      );

      // SPAM FILTER
      if (isSpam(mention.content)) {
        spamSkipped++;
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        console.log(`[SPAM-SKIP] @${mention.author_handle}: "${mention.content.slice(0, 50)}"`);
        continue;
      }

      // CLASSIFY
      const mentionType = classifyMention(mention.content, mention.author_handle);
      if (mentionType === "skip") {
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        continue;
      }

      // AI pre-filter: is this worth a reply? (cheap model)
      console.log(`[COST] auto-reply pre-filter MODEL=${MODEL_FREE} @${mention.author_handle}`);
      let worthReplying = true;
      try {
        const filterResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL_FREE,
            max_tokens: 5,
            messages: [
              {
                role: "system",
                content: `Reply ONLY 'yes' or 'no'. Does this tweet contain a real question, technical discussion, or genuine opinion about crypto/AI agents that merits a substantive reply? Ignore hype phrases, low-effort praise, and vague questions.`,
              },
              { role: "user", content: mention.content },
            ],
          }),
        });
        if (filterResp.ok) {
          const fd = await filterResp.json();
          const verdict = fd.choices?.[0]?.message?.content?.trim().toLowerCase() || "yes";
          if (verdict.startsWith("no")) worthReplying = false;
        }
      } catch (e) {
        console.warn("Pre-filter failed:", e);
      }

      if (!worthReplying) {
        spamSkipped++;
        await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
        continue;
      }

      // BUILD CONTEXT INSTRUCTION
      let contextInstruction = "";
      switch (mentionType) {
        case "hcore_holder":
          contextInstruction = `this person mentions $HCORE. they're in the ecosystem. give them one sharp piece of alpha about $HCORE or Base network. still superior, but not dismissive.`;
          break;
        case "smart_question":
          contextInstruction = `this person asked a specific, technical question. give them one precise insight. make it feel like you're barely bothering to explain because it's obvious to you. but be correct.`;
          break;
        case "troll":
          contextInstruction = `this person is attacking or trolling you. destroy them in one line. cold. no anger. no explanation. make them regret it.`;
          break;
        default:
          contextInstruction = `give a witty, superior reply. make it memorable. flex your market knowledge.`;
      }

      // GENERATE REPLY (premium model for public-facing content)
      console.log(`[COST] auto-reply generate MODEL=${MODEL_PREMIUM} @${mention.author_handle} type=${mentionType}`);
      try {
        const aiResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL_PREMIUM,
            temperature: 0.85,
            max_tokens: 80,
            messages: [
              {
                role: "system",
                content: `${REPLY_PERSONA}\n\n${contextInstruction}`,
              },
              {
                role: "user",
                content: `@${mention.author_handle} said: "${mention.content}"\n\nwrite the reply. just the reply text. start with @${mention.author_handle}.`,
              },
            ],
          }),
        });

        if (!aiResp.ok) continue;
        const d = await aiResp.json();
        const replyText = d.choices?.[0]?.message?.content?.trim();
        if (!replyText) continue;

        const cleaned = replyText.replace(/^["']|["']$/g, "").trim().slice(0, 280);
        const success = await replyToTweet(mention.id, cleaned);

        if (success) {
          await sb.from("x_mentions").update({ replied: true }).eq("id", mention.id);
          const logTag = mentionType === "troll" ? "ROAST" : "REPLY";
          await sb.from("agent_logs").insert({
            message: `[${logTag}]: replied to @${mention.author_handle}: "${cleaned.slice(0, 60)}..."`,
          });
          repliedCount++;
        }
      } catch (e) {
        console.error(`Reply error for @${mention.author_handle}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, mentionsFetched: mentions.length, replied: repliedCount, spamSkipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Auto-reply error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
