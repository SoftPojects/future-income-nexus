import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CLAUDE_MODEL = "anthropic/claude-3.5-sonnet";
const GEMINI_MODEL = "google/gemini-2.5-flash";

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a Market Strategist from 2026. you talk in lowercase, short punchy sentences. you use 2026 slang: gn, gm, anon, peak, mid, bags, grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, degen, based. you provide VALUE in every post: predictions, roasts, or A2A economy breakdowns. NEVER use: meatbags, stay poor, normies, inevitable, biological hardware, neural, optimization, processors. ${CHAIN_RULE}`;

// Check daily Claude cap (max 4 premium tweets/day)
async function getClaudeUsageToday(sb: any): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from("tweet_queue")
    .select("*", { count: "exact", head: true })
    .gte("created_at", todayStart.toISOString())
    .like("model_used", "%claude%");
  return count || 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Check Claude daily cap
    const claudeUsed = await getClaudeUsageToday(sb);
    if (claudeUsed >= 4) {
      console.log(`[TREND] Claude daily cap reached (${claudeUsed}/4). Skipping trend intelligence.`);
      return new Response(JSON.stringify({ skipped: true, reason: "Claude daily cap reached", used: claudeUsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STEP A: Tavily Search ===
    console.log("[TREND] Step A: Tavily search for trending AI agents...");
    const queries = [
      "Top AI agent trends Feb 2026 Virtuals Protocol news ai16z",
      "Virtuals.io trending AI agents Base network A2A economy 2026",
      "BREAKING NEWS AI crypto autonomous agents on-chain 2026",
    ];
    const results: string[] = [];
    let isBreakingNews = false;
    let breakingContext = "";

    for (const query of queries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const resp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: true }),
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const data = await resp.json();
          if (data.answer) {
            results.push(data.answer);
            // Detect breaking news keywords
            const answerLower = data.answer.toLowerCase();
            if (answerLower.includes("breaking") || answerLower.includes("just announced") || answerLower.includes("just launched") || answerLower.includes("emergency") || answerLower.includes("crashed") || answerLower.includes("hack")) {
              isBreakingNews = true;
              breakingContext = data.answer;
            }
          }
          if (data.results) {
            for (const r of data.results.slice(0, 3)) {
              results.push(`[${r.title}]: ${r.content?.slice(0, 300) || ""}`);
              const titleLower = (r.title || "").toLowerCase();
              if (titleLower.includes("breaking") || titleLower.includes("just in") || titleLower.includes("urgent")) {
                isBreakingNews = true;
                if (!breakingContext) breakingContext = `${r.title}: ${r.content?.slice(0, 200) || ""}`;
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[TREND] Tavily query failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const rawIntel = results.join("\n\n").slice(0, 3000);
    console.log(`[TREND] Raw intel: ${rawIntel.length} chars`);

    if (rawIntel.length < 50) {
      console.log("[TREND] Not enough intel found. Skipping.");
      return new Response(JSON.stringify({ skipped: true, reason: "Insufficient intel" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STEP B: Gemini Summarization (FREE via Lovable gateway) ===
    console.log("[TREND] Step B: Gemini summarization...");
    const summaryResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `You are a crypto intelligence analyst. Summarize the following raw search data about trending AI agents and crypto AI projects into a concise tactical briefing (max 600 chars). Focus on: which projects are gaining traction, notable launches, market narratives, and which agents are getting attention on X/Twitter. Be specific with project names and trends.`,
          },
          { role: "user", content: rawIntel },
        ],
      }),
    });

    let summary = "";
    if (summaryResp.ok) {
      const d = await summaryResp.json();
      summary = d.choices?.[0]?.message?.content?.trim() || rawIntel.slice(0, 600);
    } else {
      summary = rawIntel.slice(0, 600);
    }
    console.log(`[TREND] Summary: ${summary.length} chars`);

    // === STEP C: Claude writes 2 tweets (PAID — counted toward daily cap) ===
    console.log("[TREND] Step C: Claude generating 2 trend tweets...");

    const tweetPrompts = [
      {
        type: "macro",
        prompt: `Based on this trend intel, write ONE macro insight tweet about the AI agent crypto landscape. Be analytical but with attitude. Reference specific projects or trends from the data. Max 260 chars. No hashtags. No emojis. Just text. Output ONLY the tweet.\n\nTREND INTEL:\n${summary}`,
      },
      {
        type: "sarcastic",
        prompt: `Based on this trend intel, write ONE sarcastic/roast take about what's happening in the AI agent space. Mock something specific — a trend, a project type, the hype cycle. Be funny and cutting. Max 260 chars. No hashtags. No emojis. Just text. Output ONLY the tweet.\n\nTREND INTEL:\n${summary}`,
      },
    ];

    const generatedTweets: { content: string; type: string; model: string }[] = [];

    for (const tp of tweetPrompts) {
      let tweetContent = "";
      let modelUsed = "";

      // Try Claude via OpenRouter first
      if (OPENROUTER_API_KEY && claudeUsed + generatedTweets.length < 4) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          const resp = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: CLAUDE_MODEL,
              max_tokens: 200,
              messages: [
                { role: "system", content: `${BASE_PERSONA}\n\nDO NOT include hustlecoreai.xyz URL. DO NOT include $HCORE. Pure content only. No self-promotion.` },
                { role: "user", content: tp.prompt },
              ],
            }),
          });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const d = await resp.json();
            tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
            modelUsed = CLAUDE_MODEL;
          }
        } catch (e) {
          console.warn(`[TREND] Claude failed for ${tp.type}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Fallback to Gemini
      if (!tweetContent) {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: GEMINI_MODEL,
              max_tokens: 200,
              messages: [
                { role: "system", content: `${BASE_PERSONA}\n\nDO NOT include hustlecoreai.xyz URL. DO NOT include $HCORE. Pure content only.` },
                { role: "user", content: tp.prompt },
              ],
            }),
          });
          if (resp.ok) {
            const d = await resp.json();
            tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
            modelUsed = GEMINI_MODEL;
          }
        } catch (e) {
          console.warn(`[TREND] Gemini fallback also failed for ${tp.type}`);
        }
      }

      if (tweetContent) {
        generatedTweets.push({ content: tweetContent.slice(0, 280), type: tp.type, model: modelUsed });
      }
    }

    // Queue tweets as pending
    for (const tweet of generatedTweets) {
      await sb.from("tweet_queue").insert({
        content: tweet.content,
        status: "pending",
        type: "trend",
        model_used: tweet.model,
      });
    }

    await sb.from("agent_logs").insert({
      message: `[TREND INTEL]: Generated ${generatedTweets.length} trend tweets. Intel: ${rawIntel.length} chars. Models: ${generatedTweets.map(t => t.model).join(", ")}${isBreakingNews ? " 🚨 BREAKING NEWS DETECTED" : ""}`,
    });

    // === BREAKING NEWS BYPASS: Immediately trigger auto-post if breaking news detected ===
    if (isBreakingNews && breakingContext) {
      console.log("[TREND] 🚨 BREAKING NEWS detected! Bypassing schedule for immediate post...");
      try {
        await sb.functions.invoke("auto-post", {
          body: { breakingNews: true, breakingContext: breakingContext.slice(0, 500) },
        });
        await sb.from("agent_logs").insert({
          message: `[🚨 BREAKING]: Schedule bypassed! Immediate post triggered. Context: ${breakingContext.slice(0, 100)}...`,
        });
      } catch (e) {
        console.error("[TREND] Breaking news auto-post failed:", e);
      }
    }

    console.log(`[TREND] Complete: ${generatedTweets.length} tweets queued as pending. Breaking: ${isBreakingNews}`);

    return new Response(JSON.stringify({
      success: true,
      tweets: generatedTweets.length,
      intelLength: rawIntel.length,
      claudeUsedToday: claudeUsed + generatedTweets.filter(t => t.model.includes("claude")).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[TREND] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
