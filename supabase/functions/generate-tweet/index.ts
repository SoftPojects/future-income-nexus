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

// ─── THREAD TOPICS ────────────────────────────────────────────────────────────
const THREAD_TOPICS = [
  {
    id: "thread_trader_reality",
    hook: `why 99% of traders exit this cycle early. a thread.`,
    context: `break down the psychology of retail timing failure. use real stats from the news if available. 4 numbered insights + closing question. each tweet max 240 chars. lowercase. no hashtags.`,
  },
  {
    id: "thread_base_alpha",
    hook: `the real alpha on base network in 2026. what nobody is talking about.`,
    context: `break down 4 underrated opportunities or dynamics on Base network. reference real metrics or projects from news data. closing tweet ends with a question to drive replies. each tweet max 240 chars.`,
  },
  {
    id: "thread_ai_agent_reality",
    hook: `ai agents in crypto: what's real and what's a wrapper with a white paper.`,
    context: `break down 4 criteria that separate real AI utility from hype. be specific. use real examples from news if available. closing tweet asks what projects readers are actually watching. each tweet max 240 chars.`,
  },
  {
    id: "thread_cycle_survival",
    hook: `how to survive a crypto cycle without turning your gains into a loss. the actual playbook.`,
    context: `4 specific, contrarian rules for surviving a bull cycle. reference current market conditions from news data. each rule is one tweet. closing tweet ends with a question. each tweet max 240 chars.`,
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
    thread_trader_reality: "crypto trader mistakes retail investor losses 2026",
    thread_base_alpha: "Base network DeFi AI opportunities 2026",
    thread_ai_agent_reality: "AI agent crypto utility real vs hype 2026",
    thread_cycle_survival: "crypto bull run survival strategy 2026",
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
        days: 1,
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
  const available = TOPICS.filter(t => !recentTypes.slice(-2).includes(t.id));
  const pool = available.length > 0 ? available : TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── GENERATE THREAD ─────────────────────────────────────────────────────────
async function generateThread(
  model: string,
  OPENROUTER_API_KEY: string,
  newsContext: string,
  balance: number,
  energy: number,
  threadTopic: typeof THREAD_TOPICS[0]
): Promise<string[]> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `${BASE_PERSONA}\n\nTODAY'S LIVE DATA (last 24h):\n${newsContext}\n\nAGENT STATS: ${balance.toFixed(2)} SOL accumulated. energy: ${Math.round(energy)}%.`,
        },
        {
          role: "user",
          content: `write a 5-tweet thread as HustleCore. topic: ${threadTopic.context}

FORMAT — respond ONLY with a JSON array of 5 strings:
tweet 1: the hook — "${threadTopic.hook}" (exactly as written, you may adjust slightly)
tweets 2-4: the insights — numbered with (2/5), (3/5), (4/5)
tweet 5: closing question — ends with a direct question to the reader. drives replies.

rules: lowercase. no hashtags. no emojis. each tweet max 240 chars. raw, punchy.
respond ONLY with valid JSON array: ["tweet1", "tweet2", "tweet3", "tweet4", "tweet5"]`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter error ${response.status}`);
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "[]";

  // Parse JSON array
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Thread JSON not found in response");
  const tweets: string[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(tweets) || tweets.length < 3) throw new Error("Invalid thread array");

  return tweets.slice(0, 5).map((t: string) => t.replace(/^["']|["']$/g, "").trim().slice(0, 278));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const isThreadMode = body?.mode === "thread";

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

    // Decide model — premium 4x/day cap via hourly slot check
    const hour = new Date().getUTCHours();
    const premiumHours = [14, 17, 20, 23]; // US prime time slots
    const usePremium = premiumHours.includes(hour);
    const model = usePremium ? MODEL_PREMIUM : MODEL_FREE;

    // ── THREAD MODE ──────────────────────────────────────────────────────────
    if (isThreadMode) {
      // Pick a thread topic avoiding recent ones
      const recentThreadTypes = recentTypes.filter((t: string) => t.startsWith("thread_"));
      const availableThreadTopics = THREAD_TOPICS.filter(t => !recentThreadTypes.slice(-2).includes(t.id));
      const threadTopic = availableThreadTopics.length > 0
        ? availableThreadTopics[Math.floor(Math.random() * availableThreadTopics.length)]
        : THREAD_TOPICS[Math.floor(Math.random() * THREAD_TOPICS.length)];

      const newsContext = await fetchNewsContext(threadTopic.id);
      console.log(`[COST] generate-tweet THREAD mode topic=${threadTopic.id} model=${model}`);

      const tweets = await generateThread(model, OPENROUTER_API_KEY, newsContext, balance, energy, threadTopic);
      const threadGroupId = `thread_${Date.now()}`;

      // Schedule thread tweets 2 minutes apart starting from next peak slot
      const now = new Date();
      const baseScheduleTime = new Date(now.getTime() + 5 * 60 * 1000); // first tweet in 5 min

      const insertedIds: string[] = [];
      for (let i = 0; i < tweets.length; i++) {
        const scheduledAt = new Date(baseScheduleTime.getTime() + i * 2 * 60 * 1000).toISOString();
        const { data: inserted } = await sb.from("tweet_queue").insert({
          content: tweets[i],
          status: "pending",
          type: threadTopic.id,
          model_used: model,
          thread_group_id: threadGroupId,
          thread_position: i,
          scheduled_at: scheduledAt,
        } as any).select("id").single();
        if (inserted?.id) insertedIds.push(inserted.id);
      }

      console.log(`[SUCCESS] Thread queued: ${tweets.length} tweets, group=${threadGroupId}`);

      return new Response(JSON.stringify({
        thread: true,
        tweets,
        threadGroupId,
        topic: threadTopic.id,
        model,
        count: tweets.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SINGLE TWEET MODE (default) ──────────────────────────────────────────
    const topic = pickTopic(recentTypes);
    const newsContext = await fetchNewsContext(topic.id);

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
    content = content.replace(/^["']|["']$/g, "").trim().slice(0, 278);

    await sb.from("tweet_queue").insert({
      content,
      status: "pending",
      type: topic.id,
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
