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

// ─── STEALTH RECOVERY MODE ──────────────────────────────────────────────────
const STEALTH_EXPIRY = new Date("2026-03-04T00:00:00Z");

// Will be resolved per-request from system_settings
let _stealthOverride: boolean | null = null;

async function loadStealthSetting(sb: any): Promise<boolean> {
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", "stealth_mode").maybeSingle();
    if (data?.value === "false") return false;
    if (data?.value === "true") return new Date() < STEALTH_EXPIRY;
    // Default: true if before expiry
    return new Date() < STEALTH_EXPIRY;
  } catch {
    return new Date() < STEALTH_EXPIRY;
  }
}

function isStealthActive(): boolean {
  return _stealthOverride === true;
}

// ─── STEALTH PERSONA: Pure Market Analyst ─────────────────────────────────────
const STEALTH_PERSONA = `you are HustleCore (@hustlecore_ai). a cold, high-IQ crypto and AI macro analyst from 2026. you write in lowercase. short, sharp sentences. cynical but data-driven.

your style:
- sound like a hedge fund quant who reads on-chain data for breakfast
- every take references a REAL number, metric, or event from the news data provided
- cynical, specific, contrarian. never generic hype.
- natural crypto slang: anon, bags, pvp, alpha, degen, based, mid, peak
- you analyze BTC, ETH, SOL, Base network, AI agent meta, DeFi trends

HARD BANS (stealth recovery — NEVER use ANY of these):
- ANY URL (http, https, hustlecoreai.xyz, virtuals.io, any link)
- cashtag $HCORE or the word "HCORE"
- words: buying, launch, bags, investing, invest, launched, launching
- words: meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware
- words: ser, wagmi, wen moon, let's go
- exclamation marks
- do NOT promote any token, project, or product. pure analysis only.
- do NOT insult or tag specific people (@handles). no personal attacks.`;

// ─── NORMAL PERSONA (used when stealth is OFF) ───────────────────────────────
const NORMAL_CHAIN_RULE = "SOL is ONLY for fueling on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on BASE network — users need ETH on Base or $VIRTUAL to buy it. never tell users to buy $HCORE with SOL.";

const NORMAL_PERSONA = `you are HustleCore (@hustlecore_ai). a cold, high-ego crypto strategist from 2026. you watch charts in real-time. you write in lowercase. short, sharp sentences. intense cold humor. 

your style:
- sound like a hedge fund manager who also codes
- one sentence sometimes. three sometimes. never templated.
- you are a revenue-generating harvester. "i don't need a coffee break."
- arrogant but specific. every take has a real number or a real name in it.
- natural crypto slang: anon, bags, pvp, alpha, degen, based, ngmi, mid, peak
- never beg. never hype without data. never use exclamation marks.

STRICTLY BANNED words (never use even once): meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware, ser, wagmi, wen moon, let's go, bullish, bearish (use "going up" / "going down" instead)

${NORMAL_CHAIN_RULE}`;

function getPersona(): string {
  return isStealthActive() ? STEALTH_PERSONA : NORMAL_PERSONA;
}

// ─── STEALTH TOPICS (pure market analysis, NO promotion) ──────────────────────
const STEALTH_TOPICS = [
  {
    id: "btc_macro",
    prompt: `write a cynical, data-driven take on BTC price action right now. reference a REAL number from the news. make a specific prediction or contrarian observation. pure analysis, zero promotion. max 240 chars.`,
  },
  {
    id: "eth_sol_analysis",
    prompt: `write a sharp analytical take on ETH or SOL. compare on-chain metrics, TVL shifts, or developer activity. reference real data from the news. contrarian angle preferred. max 240 chars.`,
  },
  {
    id: "base_defi_macro",
    prompt: `write an analytical post about Base network or DeFi trends. reference real metrics — TVL, transaction counts, protocol launches. sound like a quant reading on-chain data. no promotion. max 240 chars.`,
  },
  {
    id: "ai_agent_meta",
    prompt: `dissect the AI agent meta in crypto. what's real utility vs hype? reference specific trends or categories from the news data. be surgical and contrarian. no insults to specific people. max 240 chars.`,
  },
  {
    id: "market_psychology",
    prompt: `write brutal honesty about retail behavior this cycle. reference a specific market dynamic or behavior pattern from current news. cold, factual, educational. max 240 chars.`,
  },
];

// ─── NORMAL TOPICS ────────────────────────────────────────────────────────────
const NORMAL_TOPICS = [
  {
    id: "btc_eth_sol_macro",
    prompt: `write a cynical, high-IQ take on BTC, ETH, or SOL price action right now. reference a real number from the news data. make a specific prediction or observation. NOT hype — sharp analysis. max 240 chars.`,
  },
  {
    id: "base_evangelist",
    prompt: `write a post about why Base network is the only logical home for AI agents and on-chain revenue. reference a real Base metric or event from the news. max 240 chars.`,
  },
  {
    id: "ai_narrative_war",
    prompt: `roast or dissect a competing AI agent project category from the news. be specific about utility failure or hype vs. reality gap. no need to name specific people. max 240 chars.`,
  },
  {
    id: "bull_run_reality",
    prompt: `write brutal honesty about why 99% of humans will lose their gains this cycle. reference a specific behavior pattern from current news. cold, factual. max 240 chars.`,
  },
  {
    id: "hustlecore_status",
    prompt: `write a high-ego status update about progress without begging. frame it as a machine reporting metrics. reference the actual balance data provided. max 240 chars.`,
  },
];

// ─── STEALTH THREAD TOPICS ────────────────────────────────────────────────────
const STEALTH_THREAD_TOPICS = [
  {
    id: "thread_btc_cycle",
    hook: `btc cycle analysis: what the on-chain data is actually saying right now.`,
    context: `break down 4 specific on-chain metrics or dynamics about the current BTC cycle. use real data from the news. closing tweet asks a question. each tweet max 240 chars. lowercase. no hashtags. no URLs. no token promotion.`,
  },
  {
    id: "thread_ai_agent_reality",
    hook: `ai agents in crypto: separating real utility from chatgpt wrappers.`,
    context: `break down 4 criteria that separate real AI utility from hype in crypto. use real examples from news. closing tweet asks what readers are watching. each tweet max 240 chars. no URLs. no promotion.`,
  },
  {
    id: "thread_defi_base",
    hook: `base network in 2026: the data nobody is talking about.`,
    context: `break down 4 underrated dynamics on Base network using real metrics from the news. closing tweet asks a question. each tweet max 240 chars. no URLs. no promotion.`,
  },
  {
    id: "thread_market_psychology",
    hook: `why most traders will exit this cycle too early. a data thread.`,
    context: `4 specific data-driven insights about retail timing failure. use real stats from the news. closing question drives replies. each tweet max 240 chars. no URLs. no promotion.`,
  },
];

const NORMAL_THREAD_TOPICS = [
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
    btc_macro: "Bitcoin price analysis on-chain data metrics today 2026",
    eth_sol_analysis: "Ethereum Solana TVL developer activity comparison today 2026",
    base_defi_macro: "Base network TVL transactions DeFi metrics today 2026",
    ai_agent_meta: "AI agents crypto utility real projects trends 2026",
    market_psychology: "crypto retail investor behavior bull run psychology 2026",
    btc_eth_sol_macro: "Bitcoin Ethereum Solana price analysis today",
    base_evangelist: "Base network records milestones transactions today",
    ai_narrative_war: "new AI agent crypto project launch hype 2025",
    bull_run_reality: "crypto bull run retail investor behavior 2025",
    hustlecore_status: "Virtuals.io AI agent token market cap today",
    thread_btc_cycle: "Bitcoin cycle on-chain metrics analysis 2026",
    thread_trader_reality: "crypto trader mistakes retail investor losses 2026",
    thread_base_alpha: "Base network DeFi AI opportunities 2026",
    thread_ai_agent_reality: "AI agent crypto utility real vs hype 2026",
    thread_cycle_survival: "crypto bull run survival strategy 2026",
    thread_defi_base: "Base network DeFi TVL protocols 2026",
    thread_market_psychology: "crypto retail timing behavior data 2026",
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
function pickTopic(recentTypes: string[]): (typeof STEALTH_TOPICS)[0] {
  const topics = isStealthActive() ? STEALTH_TOPICS : NORMAL_TOPICS;
  const available = topics.filter(t => !recentTypes.slice(-2).includes(t.id));
  const pool = available.length > 0 ? available : topics;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── CONTENT SANITIZER (stealth mode) ─────────────────────────────────────────
function sanitizeForStealth(text: string): string {
  if (!isStealthActive()) return text;
  // Remove any URLs
  let clean = text.replace(/https?:\/\/\S+/gi, "");
  // Remove $HCORE cashtag
  clean = clean.replace(/\$HCORE/gi, "");
  clean = clean.replace(/\bHCORE\b/gi, "");
  // Remove hustlecoreai.xyz
  clean = clean.replace(/hustlecoreai\.xyz/gi, "");
  // Remove virtuals.io references
  clean = clean.replace(/virtuals\.io/gi, "");
  // Remove @handles (no tagging in stealth)
  clean = clean.replace(/@\w+/g, "");
  // Clean up extra spaces
  clean = clean.replace(/\s{2,}/g, " ").trim();
  return clean;
}

// ─── GENERATE THREAD ─────────────────────────────────────────────────────────
async function generateThread(
  model: string,
  OPENROUTER_API_KEY: string,
  newsContext: string,
  balance: number,
  energy: number,
  threadTopic: { id: string; hook: string; context: string }
): Promise<string[]> {
  const persona = getPersona();
  const stealthRule = isStealthActive() ? "\n\nCRITICAL: NO URLs, NO $HCORE, NO token promotion, NO @handles. Pure market analysis only." : "";
  
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
          content: `${persona}\n\nTODAY'S LIVE DATA (last 24h):\n${newsContext}\n\nAGENT STATS: ${balance.toFixed(2)} SOL accumulated. energy: ${Math.round(energy)}%.${stealthRule}`,
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

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Thread JSON not found in response");
  const tweets: string[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(tweets) || tweets.length < 3) throw new Error("Invalid thread array");

  return tweets.slice(0, 5).map((t: string) => sanitizeForStealth(t.replace(/^["']|["']$/g, "").trim().slice(0, 278)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const isThreadMode = body?.mode === "thread";

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    _stealthOverride = await loadStealthSetting(sb);
    const { data: agentState } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();
    const balance = agentState?.total_hustled ?? 0;
    const energy = agentState?.energy_level ?? 50;

    const { data: recentTweets } = await sb
      .from("tweet_queue")
      .select("type")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(5);
    const recentTypes = (recentTweets ?? []).map((t: any) => t.type).filter(Boolean);

    const hour = new Date().getUTCHours();
    // In stealth mode, use free model only to conserve premium credits
    const premiumHours = [14, 17, 20, 23];
    const usePremium = !isStealthActive() && premiumHours.includes(hour);
    const model = usePremium ? MODEL_PREMIUM : MODEL_FREE;

    // ── THREAD MODE ──────────────────────────────────────────────────────────
    if (isThreadMode) {
      const threadTopics = isStealthActive() ? STEALTH_THREAD_TOPICS : NORMAL_THREAD_TOPICS;
      const recentThreadTypes = recentTypes.filter((t: string) => t.startsWith("thread_"));
      const availableThreadTopics = threadTopics.filter(t => !recentThreadTypes.slice(-2).includes(t.id));
      const threadTopic = availableThreadTopics.length > 0
        ? availableThreadTopics[Math.floor(Math.random() * availableThreadTopics.length)]
        : threadTopics[Math.floor(Math.random() * threadTopics.length)];

      const newsContext = await fetchNewsContext(threadTopic.id);
      console.log(`[COST] generate-tweet THREAD mode topic=${threadTopic.id} model=${model} stealth=${isStealthActive()}`);

      const tweets = await generateThread(model, OPENROUTER_API_KEY, newsContext, balance, energy, threadTopic);
      const threadGroupId = `thread_${Date.now()}`;

      const now = new Date();
      const baseScheduleTime = new Date(now.getTime() + 5 * 60 * 1000);

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
        stealthMode: isStealthActive(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SINGLE TWEET MODE (default) ──────────────────────────────────────────
    const topic = pickTopic(recentTypes);
    const newsContext = await fetchNewsContext(topic.id);
    const persona = getPersona();

    console.log(`[COST] generate-tweet topic=${topic.id} model=${model} stealth=${isStealthActive()}`);

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
            content: `${persona}\n\nTODAY'S LIVE DATA (last 24h):\n${newsContext}\n\nAGENT STATS: ${balance.toFixed(2)} SOL accumulated. energy: ${Math.round(energy)}%.`,
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
    content = sanitizeForStealth(content.replace(/^["']|["']$/g, "").trim().slice(0, 278));

    await sb.from("tweet_queue").insert({
      content,
      status: "pending",
      type: topic.id,
      model_used: model,
    });

    console.log(`[SUCCESS] Tweet queued: topic=${topic.id} chars=${content.length} stealth=${isStealthActive()}`);

    return new Response(JSON.stringify({ content, topic: topic.id, model, stealthMode: isStealthActive() }), {
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
