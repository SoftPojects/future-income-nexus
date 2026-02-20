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

// Hardcoded high-quality poll bank — rotates daily based on day of year
const POLL_BANK = [
  { question: "btc dominance next 90 days?", options: ["goes up", "goes down"] },
  { question: "which chain hosts the most real AI agents by end of year?", options: ["Base", "Solana"] },
  { question: "99% of retail traders will exit this cycle:", options: ["too early", "too late"] },
  { question: "the real bull run hasn't started yet. agree?", options: ["yes, patience", "no, we're in it"] },
  { question: "AI agents will replace most crypto analytics tools by 2027?", options: ["definitely", "overrated"] },
  { question: "which matters more for a crypto project?", options: ["on-chain revenue", "token price"] },
  { question: "where is the next 100x opportunity in 2026?", options: ["AI agents on Base", "real world assets"] },
  { question: "best alpha source in 2026?", options: ["on-chain data", "following smart money"] },
  { question: "degen or strategist — what are you actually?", options: ["degen (honest)", "strategist (cope)"] },
  { question: "decentralized AI will be bigger than defi. agree?", options: ["100% agree", "defi still wins"] },
  { question: "is the 4-year cycle dead?", options: ["dead, new paradigm", "still runs the market"] },
  { question: "your biggest mistake this cycle so far?", options: ["sold too early", "held too long"] },
  { question: "where will eth be in 12 months?", options: ["above $10k", "below $5k"] },
  { question: "most underrated chain in 2026?", options: ["Base", "Sui"] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");

    // ── DAILY CAP: 1 poll per day ─────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = `${today}T00:00:00.000Z`;
    const { count: pollsToday } = await sb
      .from("tweet_queue")
      .select("*", { count: "exact", head: true })
      .eq("type", "poll")
      .gte("created_at", dayStart);

    if ((pollsToday ?? 0) >= 1) {
      console.log("[DAILY-POLL] Already posted a poll today. Skipping.");
      return new Response(JSON.stringify({ skipped: true, reason: "already_posted_today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PICK A POLL — try AI-generated first, fallback to bank ────────────────
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    let pollQuestion = "";
    let pollOptions: string[] = [];

    // Try to generate a trending-aware poll with Tavily + AI
    if (TAVILY_API_KEY && LOVABLE_API_KEY) {
      try {
        const tavilyResp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query: "biggest crypto debate controversy trending 2026",
            search_depth: "basic",
            max_results: 3,
            include_answer: true,
            days: 1,
          }),
        });

        if (tavilyResp.ok) {
          const tavilyData = await tavilyResp.json();
          const context = tavilyData.answer || tavilyData.results?.[0]?.content?.slice(0, 400) || "";

          if (context) {
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  {
                    role: "system",
                    content: "you are HustleCore AI. create a punchy, opinionated crypto poll that taps into a real current debate. lowercase. under 100 chars for the question. exactly 2 options, each under 25 chars. respond ONLY with valid JSON: {\"question\": \"...\", \"options\": [\"...\", \"...\"]}",
                  },
                  {
                    role: "user",
                    content: `current market context: ${context}\n\ncreate a poll question that would get strong engagement from crypto degens. pick a side — no neutral polls.`,
                  },
                ],
              }),
            });

            if (aiResp.ok) {
              const d = await aiResp.json();
              const raw = d.choices?.[0]?.message?.content?.trim() || "";
              const jsonMatch = raw.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
                  pollQuestion = parsed.question.slice(0, 100);
                  pollOptions = parsed.options.slice(0, 2).map((o: string) => o.slice(0, 25));
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("[DAILY-POLL] AI poll generation failed, using bank:", e);
      }
    }

    // Fallback to poll bank
    if (!pollQuestion) {
      const bankPoll = POLL_BANK[dayOfYear % POLL_BANK.length];
      pollQuestion = bankPoll.question;
      pollOptions = bankPoll.options;
    }

    console.log(`[DAILY-POLL] Question: "${pollQuestion}" | Options: ${pollOptions.join(" / ")}`);

    // ── POST POLL VIA X API v2 ────────────────────────────────────────────────
    const consumerKey = Deno.env.get("X_API_KEY");
    const consumerSecret = Deno.env.get("X_API_SECRET");
    const accessToken = Deno.env.get("X_ACCESS_TOKEN");
    const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET");

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      throw new Error("X API credentials not configured");
    }

    const url = "https://api.x.com/2/tweets";
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

    const signature = await generateOAuthSignature("POST", url, oauthParams, consumerSecret, accessTokenSecret);
    oauthParams.oauth_signature = signature;
    const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");

    const pollBody = {
      text: pollQuestion,
      poll: {
        options: pollOptions.map((o) => ({ label: o })),
        duration_minutes: 1440, // 24 hours
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(pollBody),
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      console.error("[DAILY-POLL] X API error:", resp.status, JSON.stringify(data));
      // Log failed attempt to prevent retry spam
      await sb.from("tweet_queue").insert({
        content: `[POLL FAILED] ${pollQuestion}`,
        status: "error",
        type: "poll",
        error_message: `${resp.status}: ${data.detail || JSON.stringify(data)}`,
      });
      throw new Error(`X API error ${resp.status}: ${data.detail || JSON.stringify(data)}`);
    }

    const tweetId = data.data?.id;
    const xUrl = tweetId ? `https://x.com/hustlecore_ai/status/${tweetId}` : null;

    // Log to tweet_queue for tracking
    await sb.from("tweet_queue").insert({
      content: `[POLL] ${pollQuestion} | ${pollOptions.join(" vs ")}`,
      status: "posted",
      type: "poll",
      posted_at: new Date().toISOString(),
    });

    await sb.from("agent_logs").insert({
      message: `[GROWTH]: Daily poll posted. "${pollQuestion}" ${xUrl || ""}`,
    });

    console.log(`[DAILY-POLL] SUCCESS. ${xUrl}`);

    return new Response(JSON.stringify({
      success: true,
      question: pollQuestion,
      options: pollOptions,
      tweetId,
      xUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[DAILY-POLL] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
