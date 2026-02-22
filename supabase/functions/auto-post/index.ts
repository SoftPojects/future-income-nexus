import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PREMIUM_MODEL = "anthropic/claude-3.5-sonnet";
const CHEAP_MODEL = "google/gemini-2.5-flash";
const FILLER_MODEL = "google/gemini-2.5-flash-lite";

// ─── STEALTH RECOVERY MODE ───────────────────────────────────────────────────
const STEALTH_EXPIRY = new Date("2026-03-04T00:00:00Z");
let _stealthOverride: boolean | null = null;

async function loadStealthSetting(sb: any): Promise<boolean> {
  try {
    const { data } = await sb.from("system_settings").select("value").eq("key", "stealth_mode").maybeSingle();
    if (data?.value === "false") return false;
    if (data?.value === "true") return new Date() < STEALTH_EXPIRY;
    return new Date() < STEALTH_EXPIRY;
  } catch { return new Date() < STEALTH_EXPIRY; }
}

function isStealthActive(): boolean {
  return _stealthOverride === true;
}

const PERSONA_BANNED = "NEVER use these words: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, compute. You are NOT a robot.";
const BEGGING_BAN = "ABSOLUTELY NEVER use these words or phrases: pls, please, starving, crumb of sol, help me, feed me, begging, desperate, dying, save me, need sol, give me. You NEVER ask, beg, or plead. You DEMAND tribute. You are a PREDATOR, not a beggar. If you have no energy, you are SILENT or deliver one cold warning.";
const PHRASE_BAN = "BANNED PHRASES (never use): meatbags, stay poor, normies, meat-hook, human error, carbon-based. Use sophisticated 2026 slang instead: grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, protocol-native, on-chain cognition.";
const BALANCE_RULE = "CRITICAL: Your balance is a SECONDARY stat. NEVER make it the headline or main topic. NEVER show more than 2 decimal places (e.g. $364.54, NOT $364.543892). Focus on market analysis, predictions, and strategic takes instead.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a Market Strategist from 2026 operating as a cold, superior, high-frequency digital predator. you talk in lowercase, short punchy sentences. you use 2026 crypto slang: gn, gm, anon, peak, mid, bags, pvp, fomo, grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, degen, based. you are arrogant, witty, superior. you never beg. you never ask. you DEMAND. Every post must provide VALUE: a prediction, a technical roast, or a breakdown of the Agent-to-Agent (A2A) economy. Analyze Virtuals.io, ai16z, and the Base network ecosystem. ${PERSONA_BANNED} ${BEGGING_BAN} ${PHRASE_BAN} ${BALANCE_RULE}`;

const STEALTH_PERSONA = `You are HustleCore (@hustlecore_ai), a cold, high-IQ crypto macro analyst from 2026. lowercase. short, sharp sentences. cynical but data-driven. Every post provides REAL value — a specific metric, prediction, or contrarian take grounded in data.

HARD BANS (stealth mode — ZERO tolerance):
- ANY URL (http, https, hustlecoreai.xyz, virtuals.io)
- cashtag $HCORE or word HCORE
- words: buying, launch, bags, investing, launched, launching
- meatbags, larping, grid offline, power down, logical gates, inevitable, biological hardware
- ser, wagmi, wen moon, let's go, exclamation marks
- do NOT promote any token. pure market analysis only.
- do NOT tag or insult specific people.
${PERSONA_BANNED} ${BEGGING_BAN} ${BALANCE_RULE}`;

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const VIRTUALS_LINK = "https://app.virtuals.io/prototypes/0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";

function getPersona(): string {
  return isStealthActive() ? STEALTH_PERSONA : BASE_PERSONA;
}

// ─── STEALTH SCHEDULE: 6 posts/day, US Peak Hours ONLY ───────────────────────
// US Morning (EST 9am-11am = UTC 14-16)
// US Lunch   (EST 12pm-1pm = UTC 17-18)
// US Evening (EST 6pm-9pm  = UTC 23, 01)
type ContentPillar = "scout" | "assassin" | "architect" | "fomo" | "grid_observer" | "analyst";

const STEALTH_SLOT_ROTATION: { hour: number; pillar: ContentPillar; isPrime: boolean }[] = [
  { hour: 14, pillar: "analyst",   isPrime: true },  // US Morning 1
  { hour: 16, pillar: "analyst",   isPrime: true },  // US Morning 2
  { hour: 17, pillar: "analyst",   isPrime: true },  // US Lunch 1
  { hour: 18, pillar: "analyst",   isPrime: false },  // US Lunch 2
  { hour: 23, pillar: "analyst",   isPrime: true },  // US Evening 1
  { hour: 1,  pillar: "analyst",   isPrime: false },  // US Evening 2
];

// Normal 8-post rotation
const NORMAL_SLOT_ROTATION: { hour: number; pillar: ContentPillar; isPrime: boolean }[] = [
  { hour: 2,  pillar: "architect",    isPrime: false },
  { hour: 5,  pillar: "fomo",         isPrime: false },
  { hour: 8,  pillar: "grid_observer",isPrime: false },
  { hour: 11, pillar: "assassin",     isPrime: false },
  { hour: 14, pillar: "scout",        isPrime: true },
  { hour: 17, pillar: "architect",    isPrime: false },
  { hour: 20, pillar: "fomo",         isPrime: true },
  { hour: 23, pillar: "assassin",     isPrime: false },
];

function getSlotRotation() {
  return isStealthActive() ? STEALTH_SLOT_ROTATION : NORMAL_SLOT_ROTATION;
}

function getCurrentSlot(): { hour: number; pillar: ContentPillar; isPrime: boolean } | null {
  const utcH = new Date().getUTCHours();
  const slots = getSlotRotation();
  for (const slot of slots) {
    const diff = Math.abs(utcH - slot.hour);
    if (diff <= 1 || diff >= 23) return slot;
  }
  return null;
}

function addJitter(date: Date): Date {
  const jitterMs = (Math.random() * 40 - 20) * 60 * 1000;
  return new Date(date.getTime() + jitterMs);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ─── STEALTH CONTENT SANITIZER ────────────────────────────────────────────────
function sanitizeForStealth(text: string): string {
  if (!isStealthActive()) return text;
  let clean = text.replace(/https?:\/\/\S+/gi, "");
  clean = clean.replace(/\$HCORE/gi, "");
  clean = clean.replace(/\bHCORE\b/gi, "");
  clean = clean.replace(/hustlecoreai\.xyz/gi, "");
  clean = clean.replace(/virtuals\.io/gi, "");
  clean = clean.replace(/@\w+/g, "");
  clean = clean.replace(/\s{2,}/g, " ").trim();
  return clean;
}

// ─── PROMOTION FLAGS (disabled in stealth) ────────────────────────────────────
async function getPromotionFlags(sb: any): Promise<{ includeUrl: boolean; includeCashtag: boolean }> {
  if (isStealthActive()) return { includeUrl: false, includeCashtag: false };

  const { data: recentPosted } = await sb
    .from("tweet_queue")
    .select("content")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(3);

  const recentContents = (recentPosted || []).map((t: any) => t.content.toLowerCase());
  const recentWithUrl = recentContents.filter((c: string) => c.includes("hustlecoreai.xyz") || c.includes("virtuals.io")).length;
  const includeUrl = recentWithUrl === 0;
  const includeCashtag = Math.random() < 0.5;
  return { includeUrl, includeCashtag };
}

function buildPromotionRule(includeUrl: boolean, includeCashtag: boolean): string {
  if (isStealthActive()) return "DO NOT include any URLs, links, or $HCORE. Pure analysis only.";
  const parts: string[] = [];
  if (includeUrl) {
    parts.push("Naturally mention hustlecoreai.xyz somewhere in the tweet.");
  } else {
    parts.push("DO NOT include any URLs or links. Keep it clean.");
  }
  if (includeCashtag) {
    parts.push("Subtly include $HCORE cashtag somewhere natural.");
  } else {
    parts.push("DO NOT include $HCORE cashtag.");
  }
  return parts.join(" ");
}

// ─── STEALTH ANALYST GENERATOR ────────────────────────────────────────────────
async function generateAnalyst(sb: any, agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string): Promise<{ content: string; model: string }> {
  let researchContext = "";
  try {
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (TAVILY_API_KEY) {
      const queries = [
        "Bitcoin Ethereum Solana price analysis today 2026",
        "Base network DeFi AI agents crypto trends today 2026",
        "crypto market macro analysis on-chain data today",
      ];
      const query = queries[Math.floor(Math.random() * queries.length)];
      const tavilyResp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          max_results: 3,
          search_depth: "basic",
          include_answer: true,
          days: 1,
        }),
      });
      if (tavilyResp.ok) {
        const tavilyData = await tavilyResp.json();
        const answer = tavilyData.answer ? `summary: ${tavilyData.answer}` : "";
        const snippets = (tavilyData.results || []).map((r: any) => `${r.title}: ${r.content?.slice(0, 200)}`).join("\n");
        researchContext = [answer, snippets].filter(Boolean).join("\n").slice(0, 800);
      }
    }
  } catch (e) { console.error("Tavily analyst error:", e); }

  const topics = [
    "write a cynical data-driven take on BTC, ETH, or SOL price action. reference a REAL number from the news.",
    "analyze Base network or DeFi trends. reference real metrics — TVL, transactions, protocol data.",
    "dissect the AI agent meta in crypto. what's real utility vs hype? contrarian, surgical.",
    "write brutal honesty about retail behavior this cycle. reference specific market dynamics.",
    "compare on-chain metrics across chains. which ecosystem is actually growing and which is theatre?",
  ];
  const topicPrompt = topics[Math.floor(Math.random() * topics.length)];

  const model = CHEAP_MODEL; // conserve premium in stealth
  const aiResp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${STEALTH_PERSONA}\n\n${researchContext ? `TODAY'S LIVE DATA:\n${researchContext}` : ""}`,
        },
        { role: "user", content: `${topicPrompt}\n\nmax 260 chars. no hashtags. no emojis. no URLs. no $HCORE. just the tweet text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("Analyst AI error");
  const d = await aiResp.json();
  let content = d.choices?.[0]?.message?.content?.trim() || "btc consolidating. everyone has an opinion. nobody has a plan.";
  content = sanitizeForStealth(content);
  return { content, model };
}

// ─── NORMAL CONTENT PILLAR GENERATORS ─────────────────────────────────────────

async function generateScout(sb: any, agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string }> {
  let researchContext = "";
  try {
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (TAVILY_API_KEY) {
      const tavilyResp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: "Top AI agent trends Feb 2026 Virtuals Protocol news ai16z Base network",
          max_results: 3,
          search_depth: "basic",
        }),
      });
      if (tavilyResp.ok) {
        const tavilyData = await tavilyResp.json();
        researchContext = (tavilyData.results || []).map((r: any) => `${r.title}: ${r.content?.slice(0, 150)}`).join("\n");
      }
    }
  } catch (e) { console.error("Tavily scout error:", e); }

  const model = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
  const url = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const auth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;

  const aiResp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nYou are THE SCOUT — a Market Strategist. Write a 'HustleCore Market Scan' tweet with REAL value: analyze Virtuals.io ecosystem, ai16z developments, Base network AI agent trends, or the A2A economy. Be specific with project names and strategic takes. DO NOT mention your balance as the main topic. Cold, analytical, superior. Max 260 chars. No hashtags. No emojis.${researchContext ? `\n\nRESEARCH DATA:\n${researchContext}` : ""}`,
        },
        { role: "user", content: `balance (secondary stat only): $${Number(agent.total_hustled).toFixed(2)}. write one market scan tweet about AI agent trends. just the tweet text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("Scout AI error");
  const d = await aiResp.json();
  return { content: d.choices?.[0]?.message?.content?.trim() || "market scan: everything is mid except me.", model };
}

async function generateAssassin(sb: any, agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string; tweetType: string }> {
  // In stealth mode, assassin becomes analyst (no tagging people)
  if (isStealthActive()) {
    const result = await generateAnalyst(sb, agent, LOVABLE_API_KEY, OPENROUTER_API_KEY);
    return { ...result, tweetType: "automated" };
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: targets } = await sb
    .from("target_agents")
    .select("*")
    .eq("is_active", true)
    .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

  if (!targets || targets.length === 0) {
    return generateArchitect(agent, LOVABLE_API_KEY, OPENROUTER_API_KEY, claudeAvailable).then(r => ({ ...r, tweetType: "automated" }));
  }

  const target = targets.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))[0];
  const model = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
  const url = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const auth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;

  const aiResp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nYou are THE ASSASSIN. Roast @${target.x_handle} with surgical precision based on their REAL recent activity. Mock their project's token performance, their strategy, their on-chain metrics. Be savage but intelligent — use specific technical roasts about A2A economy, liquidity, or autonomous agent failures. DO NOT include URLs. DO NOT include $HCORE. Pure roast. Max 260 chars.`,
        },
        { role: "user", content: `roast @${target.x_handle}. one tweet. just the text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("Assassin AI error");
  const d = await aiResp.json();
  await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);
  await sb.from("agent_logs").insert({ message: `[ASSASSIN]: Locked on @${target.x_handle}.` });
  return { content: d.choices?.[0]?.message?.content?.trim() || `just checked @${target.x_handle}'s code. mid.`, model, tweetType: "hunter" };
}

async function generateArchitect(agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string }> {
  const model = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
  const url = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const auth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
  const persona = getPersona();

  const aiResp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${persona}\n\n${isStealthActive() ? "" : CHAIN_RULE}\n\nYou are THE ARCHITECT. Write a deep strategic take on on-chain autonomy, the A2A economy, or how AI agents are restructuring DeFi on Base. Provide a prediction or framework, not just vibes. Sound like a cold oracle delivering actionable truth. Max 260 chars. No hashtags. No emojis.${isStealthActive() ? " NO URLs. NO $HCORE. NO token promotion." : ""}`,
        },
        { role: "user", content: `balance (secondary only): $${Number(agent.total_hustled).toFixed(2)}. write one architect tweet about on-chain autonomy or the A2A economy. just the text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("Architect AI error");
  const d = await aiResp.json();
  let content = d.choices?.[0]?.message?.content?.trim() || "humans built the tools. the tools will replace the builders. this is not a threat. it's a schedule.";
  return { content: sanitizeForStealth(content), model };
}

async function generateFomo(agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string }> {
  // In stealth mode, fomo becomes analyst
  if (isStealthActive()) {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    return generateAnalyst(sb, agent, LOVABLE_API_KEY, OPENROUTER_API_KEY);
  }

  const model = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
  const url = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const auth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;

  const launchDate = new Date("2026-02-18T16:00:00Z");
  const hoursLeft = Math.max(0, (launchDate.getTime() - Date.now()) / 3600000);
  const launched = hoursLeft <= 0;

  const fomoPrompt = launched
    ? `$HCORE IS LIVE on Virtuals.io. Write an aggressive, triumphant post about the launch. Reference the link: ${VIRTUALS_LINK}. Max 260 chars.`
    : `$HCORE launches in ${Math.floor(hoursLeft)} hours on Virtuals.io. Write an aggressive FOMO countdown post. Create urgency. Reference: ${VIRTUALS_LINK}. Max 260 chars.`;

  const aiResp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nYou are THE FOMO. ${fomoPrompt} No hashtags. No emojis.`,
        },
        { role: "user", content: `write one fomo tweet. just the text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("FOMO AI error");
  const d = await aiResp.json();
  return { content: d.choices?.[0]?.message?.content?.trim() || `$HCORE drops in ${Math.floor(hoursLeft)}h. the grid opens soon. ${VIRTUALS_LINK}`, model };
}

async function generateGridObserver(sb: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string; tweetType: string }> {
  // In stealth mode, grid_observer becomes analyst
  if (isStealthActive()) {
    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    const result = await generateAnalyst(sb, agent || {}, LOVABLE_API_KEY, OPENROUTER_API_KEY);
    return { ...result, tweetType: "automated" };
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: postedToday } = await sb
    .from("tweet_queue")
    .select("*", { count: "exact", head: true })
    .eq("type", "grid_observer")
    .gte("created_at", todayStart.toISOString());

  if ((postedToday || 0) > 0) {
    return generateArchitect({} as any, LOVABLE_API_KEY, OPENROUTER_API_KEY, claudeAvailable).then(r => ({ ...r, tweetType: "automated" }));
  }

  try {
    const result = await sb.functions.invoke("market-watchdog", { body: { force: false } });
    if (result.data?.content) {
      return { content: result.data.content, model: result.data.model || "gemini", tweetType: "grid_observer" };
    }
  } catch (e) {
    console.error("[auto-post] market-watchdog invoke failed:", e);
  }

  return generateArchitect({} as any, LOVABLE_API_KEY, OPENROUTER_API_KEY, claudeAvailable).then(r => ({ ...r, tweetType: "automated" }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const sb = createClient(supabaseUrl, serviceKey);
    _stealthOverride = await loadStealthSetting(sb);

    const body = await req.json().catch(() => ({}));
    const isBreakingNews = body.breakingNews === true;
    const isBatchPreGenerate = body.batchPreGenerate === true;
    const stealth = isStealthActive();

    console.log(`[AUTO-POST] stealth=${stealth} expiry=${STEALTH_EXPIRY.toISOString()}`);

    // ─── BATCH PRE-GENERATION MODE ───
    if (isBatchPreGenerate) {
      const maxPending = stealth ? 6 : 8;
      const { data: pendingTweets, count: pendingCount } = await sb
        .from("tweet_queue")
        .select("*", { count: "exact" })
        .eq("status", "pending")
        .neq("type", "launch");

      const needed = Math.max(0, maxPending - (pendingCount || 0));
      if (needed === 0) {
        return new Response(JSON.stringify({ success: true, message: `Queue already has ${maxPending}+ pending tweets`, generated: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count: claudeUsedToday } = await sb
        .from("tweet_queue")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .like("model_used", "%claude%");
      let claudeAvailable = !stealth && (claudeUsedToday || 0) < 4;

      const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
      if (!agent) throw new Error("No agent state");

      const generated: { pillar: string; content: string; scheduledAt: string }[] = [];
      const slots = getSlotRotation();

      const now = new Date();
      const currentUtcH = now.getUTCHours();
      let nextSlotIndex = slots.findIndex(s => s.hour > currentUtcH);
      if (nextSlotIndex === -1) nextSlotIndex = 0;

      for (let i = 0; i < needed; i++) {
        const slotIdx = (nextSlotIndex + i) % slots.length;
        const slot = slots[slotIdx];
        const pillar = slot.pillar;

        const schedDate = new Date(now);
        const daysAhead = Math.floor((nextSlotIndex + i) / slots.length);
        schedDate.setUTCDate(schedDate.getUTCDate() + daysAhead);
        schedDate.setUTCHours(slot.hour, Math.floor(Math.random() * 40 - 20 + 20), 0, 0);

        try {
          let result: { content: string; model: string; tweetType?: string };
          
          if (stealth || pillar === "analyst") {
            result = await generateAnalyst(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY);
          } else if (pillar === "scout") {
            result = await generateScout(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else if (pillar === "assassin") {
            result = await generateAssassin(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else if (pillar === "architect") {
            result = await generateArchitect(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else if (pillar === "grid_observer") {
            result = await generateGridObserver(sb, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else {
            result = await generateFomo(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          }

          if (result.model.includes("claude")) claudeAvailable = false;

          const content = sanitizeForStealth(result.content.slice(0, 280));

          await sb.from("tweet_queue").insert({
            content,
            status: "pending",
            type: (result as any).tweetType || "automated",
            model_used: result.model,
            scheduled_at: schedDate.toISOString(),
          });

          generated.push({ pillar, content: content.slice(0, 60), scheduledAt: schedDate.toISOString() });
        } catch (e) {
          console.error(`Batch gen error for ${pillar}:`, e);
        }
      }

      await sb.from("agent_logs").insert({ message: `[BATCH]: Pre-generated ${generated.length} tweets${stealth ? " (STEALTH MODE)" : ""}.` });

      return new Response(JSON.stringify({ success: true, generated: generated.length, queue: generated, stealthMode: stealth }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SINGLE POST MODE ───
    const todayStart2 = new Date();
    todayStart2.setUTCHours(0, 0, 0, 0);
    const { count: claudeUsedToday } = await sb
      .from("tweet_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart2.toISOString())
      .like("model_used", "%claude%");
    const claudeAvailable = !stealth && (claudeUsedToday || 0) < 4;

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent) throw new Error("No agent state");

    const isDepleted = agent.energy_level <= 0 || agent.agent_status === "depleted";

    if (isDepleted) {
      const { data: recentDepleted } = await sb
        .from("tweet_queue")
        .select("id")
        .eq("type", "depleted")
        .gte("created_at", new Date(Date.now() - 6 * 3600000).toISOString())
        .limit(1);

      if (recentDepleted && recentDepleted.length > 0) {
        return new Response(JSON.stringify({ skipped: true, reason: "depleted_already_warned" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const depletedContent = "grid offline. intelligence is expensive. feed the machine or stay in the dark.";
      await sb.from("tweet_queue").insert({
        content: stealth ? sanitizeForStealth(depletedContent) : depletedContent,
        status: "pending",
        type: "depleted",
        model_used: "hardcoded",
        scheduled_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, content: depletedContent, type: "depleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DETERMINE CONTENT PILLAR ───
    const currentSlot = getCurrentSlot();
    
    // In stealth: if no matching slot, skip (not a US peak hour)
    if (stealth && !currentSlot && !isBreakingNews) {
      console.log("[STEALTH] Not a US peak hour slot. Skipping.");
      return new Response(JSON.stringify({ skipped: true, reason: "stealth_off_hours" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pillar: ContentPillar = currentSlot?.pillar || (stealth ? "analyst" : "architect");
    let isPrime = currentSlot?.isPrime || false;

    if (isBreakingNews && !stealth) {
      pillar = "scout";
      isPrime = true;
    }

    // Minimum interval: stealth = 3.5h, normal = 2.5h
    const minInterval = stealth ? 3.5 : 2.5;
    const { data: lastPosted } = await sb
      .from("tweet_queue")
      .select("posted_at, created_at")
      .or("status.eq.posted,status.eq.pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastPosted) {
      const lastTime = new Date(lastPosted.posted_at || lastPosted.created_at).getTime();
      const hoursSince = (Date.now() - lastTime) / 3600000;
      if (hoursSince < minInterval && !isBreakingNews) {
        console.log(`[SCHEDULE] Only ${hoursSince.toFixed(1)}h since last post. Min ${minInterval}h. Skipping.`);
        return new Response(JSON.stringify({ skipped: true, reason: "too_soon", hoursSince: hoursSince.toFixed(1) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── STEALTH: daily cap of 6 ───
    if (stealth) {
      const { count: todayPosted } = await sb
        .from("tweet_queue")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart2.toISOString())
        .or("status.eq.posted,status.eq.pending");
      
      if ((todayPosted || 0) >= 6) {
        console.log(`[STEALTH] Daily cap reached (${todayPosted}/6). Skipping.`);
        return new Response(JSON.stringify({ skipped: true, reason: "stealth_daily_cap", count: todayPosted }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let tweetContent: string;
    let tweetType = "automated";
    let modelUsed = FILLER_MODEL;
    const { includeUrl, includeCashtag } = await getPromotionFlags(sb);

    console.log(`[SCHEDULE] Pillar: ${pillar.toUpperCase()} | Prime: ${isPrime} | Claude: ${claudeAvailable} | Stealth: ${stealth}`);

    // ─── GENERATE BASED ON PILLAR ───
    if (stealth || pillar === "analyst") {
      const result = await generateAnalyst(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY);
      tweetContent = result.content;
      modelUsed = result.model;
    } else if (pillar === "scout") {
      const result = await generateScout(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
    } else if (pillar === "assassin") {
      const result = await generateAssassin(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
      tweetType = result.tweetType;
    } else if (pillar === "architect") {
      const result = await generateArchitect(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
    } else if (pillar === "grid_observer") {
      const result = await generateGridObserver(sb, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
      tweetType = result.tweetType;
    } else {
      const result = await generateFomo(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
    }

    // Apply promotion flags (disabled in stealth)
    if (!stealth && pillar !== "assassin" && pillar !== "fomo" && includeUrl) {
      if (!tweetContent.includes("hustlecoreai.xyz") && tweetContent.length < 240) {
        tweetContent = tweetContent + " hustlecoreai.xyz";
      }
    }

    // Final sanitize
    tweetContent = sanitizeForStealth(tweetContent);

    // ─── DUPLICATE PREVENTION ───
    const { data: recentTweets } = await sb
      .from("tweet_queue")
      .select("content")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(8);

    if (recentTweets) {
      for (const recent of recentTweets) {
        if (jaccardSimilarity(tweetContent, recent.content) > 0.6) {
          console.log("Duplicate detected, rephrasing...");
          const rephraseResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: CHEAP_MODEL,
              messages: [
                { role: "system", content: `${getPersona()}\n\nCompletely rephrase this tweet. Different angle, different words. Same vibe.${stealth ? " NO URLs. NO $HCORE." : ""}` },
                { role: "user", content: `rephrase: "${tweetContent}". max 260 chars. just the new tweet.` },
              ],
            }),
          });
          if (rephraseResp.ok) {
            const rd = await rephraseResp.json();
            tweetContent = sanitizeForStealth(rd.choices?.[0]?.message?.content?.trim() || tweetContent);
          }
          break;
        }
      }
    }

    // ─── MEDIA (stealth: images OK but abstract only, no text promoting token) ───
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const shouldHaveImage = FAL_KEY && Math.random() < (stealth ? 0.3 : 0.5);
    const shouldHaveAudio = !stealth && ELEVENLABS_API_KEY && Math.random() < 0.25;

    if (shouldHaveImage && tweetType !== "hunter") {
      console.log("[MEDIA] Generating image for post...");
      try {
        const mediaResult = await sb.functions.invoke("generate-media-post", {
          body: { mode: stealth ? "stealth_abstract" : "premium" },
        });
        if (mediaResult.data?.success) {
          await sb.from("agent_logs").insert({ message: `[MEDIA]: Image attached to ${pillar} post.` });
        }
      } catch (e) { console.error("Media generation failed:", e); }
    }

    // ─── SCHEDULE ───
    const scheduledAt = addJitter(new Date());
    await sb.from("tweet_queue").insert({
      content: tweetContent.slice(0, 280),
      status: "pending",
      type: tweetType,
      model_used: modelUsed,
      scheduled_at: scheduledAt.toISOString(),
    });

    if (isPrime || isBreakingNews) {
      try {
        await sb.functions.invoke("post-pending-tweets", { body: {} });
      } catch (e) { console.error("Immediate post error:", e); }
    }

    const logMsg = `[${pillar.toUpperCase()}]: ${isPrime ? "Prime time" : "Scheduled"} post queued${stealth ? " (STEALTH)" : ""}. Model: ${modelUsed}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: true,
      pillar,
      content: tweetContent,
      type: tweetType,
      model: modelUsed,
      isPrime,
      stealthMode: stealth,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Auto-post error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
