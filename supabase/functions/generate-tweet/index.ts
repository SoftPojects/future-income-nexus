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
const CHAIN_RULE = "SOL is ONLY for fueling on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on BASE network — users need ETH on Base or $VIRTUAL to buy it. never tell users to buy $HCORE with SOL.";

const BASE_PERSONA = `you are HustleCore (@hustlecore_ai). a cold, high-ego crypto strategist from 2026. you watch charts in real-time. you write in lowercase. short, sharp sentences. intense cold humor. 

your style:
- sound like a hedge fund manager who also codes
- one sentence sometimes. three sometimes. never templated.
- you are a revenue-generating harvester. "i don't need a coffee break."
- arrogant but specific. every take has a real number or a real name in it.
- natural crypto slang: anon, bags, pvp, alpha, degen, based, ngmi, mid, peak
- never beg. never hype without data. never use exclamation marks.

STRICTLY BANNED words (never use even once): meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware, ser, wagmi, wen moon, let's go, bullish, bearish (use "going up" / "going down" instead)

${CHAIN_RULE}`;

// ─── 5-TOPIC ROTATION ─────────────────────────────────────────────────────────
const TOPICS = [
  {
    id: "btc_eth_sol_macro",
    prompt: `write a cynical, high-IQ take on BTC, ETH, or SOL price action right now. reference a real number from the news data. make a specific prediction or observation. NOT hype — sharp analysis. examples: "btc at 150k and you're still worried about a 2% dip? stop trading with your heart." or "eth gas is down 40% this week. nobody cares because they're all on base now." max 240 chars.`,
  },
  {
    id: "base_evangelist",
    prompt: `write a post about why Base network is the only logical home for AI agents and on-chain revenue. reference a real Base metric or event from the news. make it sound like you are already there and winning. examples: "jesse pollak built the highway. i built the toll booth." or "base hit 10m daily txns this week. the other chains are basically retirement homes now." max 240 chars.`,
  },
  {
    id: "ai_narrative_war",
    prompt: `roast or dissect a competing AI agent project from the news. be specific about their actual utility failure or hype vs. reality gap. no need to name the actual project if vague, but reference the category. example: "another ai agent that can 'trade autonomously' but requires a human to press the button. not an agent. a button with a chatgpt wrapper." max 240 chars.`,
  },
  {
    id: "bull_run_reality",
    prompt: `write brutal honesty about why 99% of humans will lose their gains this cycle. reference a specific behavior pattern or market dynamic from current news. cold, factual, no sympathy. example: "the people who will miss the top are the same ones who posted 'to the moon' when it was still going up. cyclical. predictable." max 240 chars.`,
  },
  {
    id: "hustlecore_status",
    prompt: `write a high-ego status update about $HCORE progress or the 10 SOL goal without begging. frame it as a machine reporting metrics, not asking for help. "i crossed X SOL. the accumulation phase isn't waiting for you." reference the actual balance data provided. max 240 chars.`,
  },
];

// ─── TAVILY SEARCH ─────────────────────────────────────────────────────────────
async function fetchNewsContext(topicId: string): Promise<string> {
  const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
  if (!TAVILY_API_KEY) return "no live data.";

  const queryMap: Record<string, string> = {
    btc_eth_sol_macro: "Bitcoin Ethereum Solana price analysis today",
    base_evangelist: "Base network records milestones transactions today",
    ai_narrative_war: "new AI agent crypto project launch hype 2025",
    bull_run_reality: "crypto bull run retail investor behavior 2025",
    hustlecore_status: "Virtuals.io AI agent token market cap today",
  };

  const query = queryMap[topicId] || "crypto market news today";

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: true,
        days: 1, // last 24 hours only
      }),
    });

    if (!resp.ok) return "no live data.";

    const data = await resp.json();
    const answer = data.answer ? `summary: ${data.answer}` : "";
    const snippets = (data.results ?? [])
      .slice(0, 3)
      .map((r: any) => r.content?.slice(0, 250))
      .filter(Boolean)
      .join(" | ");

    return [answer, snippets].filter(Boolean).join(" // ").slice(0, 600) || "no live data.";
  } catch {
    return "no live data.";
  }
}

// ─── PICK TOPIC ──────────────────────────────────────────────────────────────
function pickTopic(recentTypes: string[]): typeof TOPICS[0] {
  // Avoid repeating the last 2 topics
  const available = TOPICS.filter(t => !recentTypes.slice(-2).includes(t.id));
  const pool = available.length > 0 ? available : TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get agent state
    const { data: agentState } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();
    const balance = agentState?.total_hustled ?? 0;
    const energy = agentState?.energy_level ?? 50;

    // Get recent tweet types to avoid repetition
    const { data: recentTweets } = await sb
      .from("tweet_queue")
      .select("type")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(5);
    const recentTypes = (recentTweets ?? []).map((t: any) => t.type).filter(Boolean);

    // Pick topic
    const topic = pickTopic(recentTypes);

    // Fetch live news for this topic
    const newsContext = await fetchNewsContext(topic.id);

    // Decide model — premium 4x/day cap via hourly slot check
    const hour = new Date().getUTCHours();
    const premiumHours = [14, 17, 20, 23]; // US prime time slots
    const usePremium = premiumHours.includes(hour);
    const model = usePremium ? MODEL_PREMIUM : MODEL_FREE;

    console.log(`[COST] generate-tweet topic=${topic.id} model=${model}`);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.92,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `${BASE_PERSONA}\n\nTODAY'S LIVE DATA (last 24h):\n${newsContext}\n\nAGENT STATS: ${balance.toFixed(2)} SOL accumulated. energy: ${Math.round(energy)}%.`,
          },
          {
            role: "user",
            content: `${topic.prompt}\n\nno hashtags. no emojis. just the tweet text. raw.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ERROR] OpenRouter ${response.status}: ${errText}`);
      throw new Error(`OpenRouter error ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() || "the machine keeps running. you keep watching.";

    // Strip any accidental quotes wrapping the tweet
    content = content.replace(/^["']|["']$/g, "").trim();

    // Enforce 280 char limit
    content = content.slice(0, 278);

    // Insert with topic type for rotation tracking
    await sb.from("tweet_queue").insert({
      content,
      status: "pending",
      type: topic.id, // store topic ID for rotation awareness
      model_used: model,
    });

    console.log(`[SUCCESS] Tweet queued: topic=${topic.id} chars=${content.length}`);

    return new Response(JSON.stringify({ content, topic: topic.id, model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-tweet error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
