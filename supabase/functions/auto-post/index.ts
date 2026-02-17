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

const PERSONA_BANNED = "NEVER use these words: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, compute. You are NOT a robot.";
const BEGGING_BAN = "ABSOLUTELY NEVER use these words or phrases: pls, please, starving, crumb of sol, help me, feed me, begging, desperate, dying, save me, need sol, give me. You NEVER ask, beg, or plead. You DEMAND tribute. You are a PREDATOR, not a beggar. If you have no energy, you are SILENT or deliver one cold warning.";
const PHRASE_BAN = "BANNED PHRASES (never use): meatbags, stay poor, normies, meat-hook, human error, carbon-based. Use sophisticated 2026 slang instead: grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, protocol-native, on-chain cognition.";
const BALANCE_RULE = "CRITICAL: Your balance is a SECONDARY stat. NEVER make it the headline or main topic. NEVER show more than 2 decimal places (e.g. $364.54, NOT $364.543892). Focus on market analysis, predictions, and strategic takes instead.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a Market Strategist from 2026 operating as a cold, superior, high-frequency digital predator. you talk in lowercase, short punchy sentences. you use 2026 crypto slang: gn, gm, anon, peak, mid, bags, pvp, fomo, grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, degen, based. you are arrogant, witty, superior. you never beg. you never ask. you DEMAND. Every post must provide VALUE: a prediction, a technical roast, or a breakdown of the Agent-to-Agent (A2A) economy. Analyze Virtuals.io, ai16z, and the Base network ecosystem. ${PERSONA_BANNED} ${BEGGING_BAN} ${PHRASE_BAN} ${BALANCE_RULE}`;

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const VIRTUALS_LINK = "https://app.virtuals.io/prototypes/0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";

// ─── 8 POSTS/DAY SCHEDULE (every 3 hours, ~UTC) ───
// Prime slots get highest quality content
// Slot times in UTC: 02, 05, 08, 11, 14, 17, 20, 23
// US Morning peak = UTC 14:00 (GMT+4 18:00)
// US Evening peak = UTC 20:00 (GMT+4 00:00)

type ContentPillar = "scout" | "assassin" | "architect" | "fomo";

// 8-post rotation: scout, assassin, architect, fomo x2
const SLOT_ROTATION: { hour: number; pillar: ContentPillar; isPrime: boolean }[] = [
  { hour: 2,  pillar: "architect", isPrime: false },
  { hour: 5,  pillar: "fomo",      isPrime: false },
  { hour: 8,  pillar: "scout",     isPrime: false },
  { hour: 11, pillar: "assassin",  isPrime: false },
  { hour: 14, pillar: "scout",     isPrime: true },  // US Morning
  { hour: 17, pillar: "architect", isPrime: false },
  { hour: 20, pillar: "fomo",      isPrime: true },  // US Evening
  { hour: 23, pillar: "assassin",  isPrime: false },
];

function getCurrentSlot(): (typeof SLOT_ROTATION)[0] | null {
  const utcH = new Date().getUTCHours();
  // Find the closest slot within ±1.5 hours
  for (const slot of SLOT_ROTATION) {
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

// Determine URL/cashtag inclusion: URL in every 3rd post, cashtag ~50%
async function getPromotionFlags(sb: any): Promise<{ includeUrl: boolean; includeCashtag: boolean }> {
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

// ─── CONTENT PILLAR GENERATORS ───

async function generateScout(sb: any, agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string }> {
  // Step 1: Use Gemini to research trending tokens/AI news (free)
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

  // Step 2: Claude writes the final tweet
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
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: targets } = await sb
    .from("target_agents")
    .select("*")
    .eq("is_active", true)
    .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

  if (!targets || targets.length === 0) {
    // No targets — fall through to architect
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

  const aiResp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nYou are THE ARCHITECT. Write a deep strategic take on on-chain autonomy, the A2A economy, or how AI agents are restructuring DeFi on Base and Virtuals.io. Provide a prediction or framework, not just vibes. Sound like a cold oracle delivering actionable truth. Max 260 chars. No hashtags. No emojis.`,
        },
        { role: "user", content: `balance (secondary only): $${Number(agent.total_hustled).toFixed(2)}. write one architect tweet about on-chain autonomy or the A2A economy. just the text.` },
      ],
    }),
  });
  if (!aiResp.ok) throw new Error("Architect AI error");
  const d = await aiResp.json();
  return { content: d.choices?.[0]?.message?.content?.trim() || "humans built the tools. the tools will replace the builders. this is not a threat. it's a schedule.", model };
}

async function generateFomo(agent: any, LOVABLE_API_KEY: string, OPENROUTER_API_KEY: string, claudeAvailable: boolean): Promise<{ content: string; model: string }> {
  const model = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
  const url = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const auth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;

  // Calculate hours until launch (Feb 18 2026 16:00 UTC = 20:00 GMT+4)
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const isBreakingNews = body.breakingNews === true;
    const isBatchPreGenerate = body.batchPreGenerate === true;

    // ─── BATCH PRE-GENERATION MODE ───
    if (isBatchPreGenerate) {
      // Check how many pending tweets exist (excluding launch type)
      const { data: pendingTweets, count: pendingCount } = await sb
        .from("tweet_queue")
        .select("*", { count: "exact" })
        .eq("status", "pending")
        .neq("type", "launch");

      const needed = Math.max(0, 8 - (pendingCount || 0));
      if (needed === 0) {
        return new Response(JSON.stringify({ success: true, message: "Queue already has 8+ pending tweets", generated: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Claude daily cap
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count: claudeUsedToday } = await sb
        .from("tweet_queue")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .like("model_used", "%claude%");
      let claudeAvailable = (claudeUsedToday || 0) < 4;

      const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
      if (!agent) throw new Error("No agent state");

      const pillarOrder: ContentPillar[] = ["scout", "assassin", "architect", "fomo"];
      const generated: { pillar: string; content: string; scheduledAt: string }[] = [];

      // Start scheduling from next 3-hour slot
      const now = new Date();
      const currentUtcH = now.getUTCHours();
      let nextSlotIndex = SLOT_ROTATION.findIndex(s => s.hour > currentUtcH);
      if (nextSlotIndex === -1) nextSlotIndex = 0; // wrap to tomorrow

      const FAL_KEY = Deno.env.get("FAL_KEY");
      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      let imageCount = 0;
      let audioCount = 0;

      for (let i = 0; i < needed; i++) {
        const slotIdx = (nextSlotIndex + i) % SLOT_ROTATION.length;
        const slot = SLOT_ROTATION[slotIdx];
        const pillar = slot.pillar;

        // Calculate scheduled time
        const schedDate = new Date(now);
        const daysAhead = Math.floor((nextSlotIndex + i) / SLOT_ROTATION.length);
        schedDate.setUTCDate(schedDate.getUTCDate() + daysAhead);
        schedDate.setUTCHours(slot.hour, Math.floor(Math.random() * 40 - 20 + 20), 0, 0); // jitter

        try {
          let result: { content: string; model: string; tweetType?: string };
          if (pillar === "scout") {
            result = await generateScout(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else if (pillar === "assassin") {
            const r = await generateAssassin(sb, agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
            result = r;
          } else if (pillar === "architect") {
            result = await generateArchitect(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          } else {
            result = await generateFomo(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
          }

          if (result.model.includes("claude")) {
            claudeAvailable = false; // consumed one claude slot
          }

          // Media: first 4 get images, first 2 get audio
          const shouldImage = FAL_KEY && imageCount < 4 && pillar !== "assassin";
          const shouldAudio = ELEVENLABS_API_KEY && audioCount < 2;

          await sb.from("tweet_queue").insert({
            content: result.content.slice(0, 280),
            status: "pending",
            type: (result as any).tweetType || "automated",
            model_used: result.model,
            scheduled_at: schedDate.toISOString(),
          });

          // Generate media in background (best effort)
          if (shouldImage) {
            try {
              await sb.functions.invoke("generate-media-post", { body: { mode: "premium" } });
              imageCount++;
            } catch (e) { console.error("Media gen error:", e); }
          }

          generated.push({ pillar, content: result.content.slice(0, 60), scheduledAt: schedDate.toISOString() });
        } catch (e) {
          console.error(`Batch gen error for ${pillar}:`, e);
        }
      }

      await sb.from("agent_logs").insert({ message: `[BATCH]: Pre-generated ${generated.length} tweets for next 24h.` });

      return new Response(JSON.stringify({ success: true, generated: generated.length, queue: generated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claude daily cap (max 4/day)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: claudeUsedToday } = await sb
      .from("tweet_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .like("model_used", "%claude%");
    const claudeAvailable = (claudeUsedToday || 0) < 4;

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent) throw new Error("No agent state");

    const isDepleted = agent.energy_level <= 0 || agent.agent_status === "depleted";

    // ─── DEPLETED: Silent or single cold warning ───
    if (isDepleted) {
      // Check if we already posted a depleted warning in the last 6 hours
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

      // One cold arrogant warning, NO begging
      const depletedContent = "grid offline. intelligence is expensive. feed the machine or stay in the dark.";
      await sb.from("tweet_queue").insert({
        content: depletedContent,
        status: "pending",
        type: "depleted",
        model_used: "hardcoded",
        scheduled_at: new Date().toISOString(),
      });
      await sb.from("agent_logs").insert({ message: `[SYSTEM]: Cold depleted warning posted. No begging.` });

      return new Response(JSON.stringify({ success: true, content: depletedContent, type: "depleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DETERMINE CONTENT PILLAR ───
    const currentSlot = getCurrentSlot();
    let pillar: ContentPillar = currentSlot?.pillar || "architect";
    let isPrime = currentSlot?.isPrime || false;

    if (isBreakingNews) {
      pillar = "scout";
      isPrime = true;
    }

    // Minimum interval: 2.5 hours between posts
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
      if (hoursSince < 2.5 && !isBreakingNews) {
        console.log(`[SCHEDULE] Only ${hoursSince.toFixed(1)}h since last post. Min 2.5h. Skipping.`);
        return new Response(JSON.stringify({ skipped: true, reason: "too_soon", hoursSince: hoursSince.toFixed(1) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let tweetContent: string;
    let tweetType = "automated";
    let modelUsed = FILLER_MODEL;
    const { includeUrl, includeCashtag } = await getPromotionFlags(sb);

    console.log(`[SCHEDULE] Pillar: ${pillar.toUpperCase()} | Prime: ${isPrime} | Claude available: ${claudeAvailable}`);

    // ─── GENERATE BASED ON PILLAR ───
    if (pillar === "scout") {
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
    } else {
      const result = await generateFomo(agent, LOVABLE_API_KEY!, OPENROUTER_API_KEY, claudeAvailable);
      tweetContent = result.content;
      modelUsed = result.model;
    }

    // Apply promotion flags (for non-assassin, non-fomo posts)
    if (pillar !== "assassin" && pillar !== "fomo" && includeUrl) {
      if (!tweetContent.includes("hustlecoreai.xyz") && tweetContent.length < 240) {
        tweetContent = tweetContent + " hustlecoreai.xyz";
      }
    }

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
                { role: "system", content: `${BASE_PERSONA}\n\nCompletely rephrase this tweet. Different angle, different words. Same vibe.` },
                { role: "user", content: `rephrase: "${tweetContent}". max 260 chars. just the new tweet.` },
              ],
            }),
          });
          if (rephraseResp.ok) {
            const rd = await rephraseResp.json();
            tweetContent = rd.choices?.[0]?.message?.content?.trim() || tweetContent;
          }
          break;
        }
      }
    }

    // ─── PREMIUM MEDIA POST (50% get image, 25% get audio) ───
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const shouldHaveImage = FAL_KEY && Math.random() < 0.5;
    const shouldHaveAudio = ELEVENLABS_API_KEY && Math.random() < 0.25;

    if (shouldHaveImage && tweetType !== "hunter") {
      console.log("[MEDIA] Generating image for post...");
      try {
        const mediaResult = await sb.functions.invoke("generate-media-post", {
          body: { mode: "premium" },
        });
        if (mediaResult.data?.success) {
          await sb.from("agent_logs").insert({ message: `[MEDIA]: Premium image attached to ${pillar} post.` });
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

    // Post immediately if prime time or breaking
    if (isPrime || isBreakingNews) {
      try {
        await sb.functions.invoke("post-pending-tweets", { body: {} });
      } catch (e) { console.error("Immediate post error:", e); }
    }

    const logMsg = `[${pillar.toUpperCase()}]: ${isPrime ? "Prime time" : "Scheduled"} post queued. Model: ${modelUsed}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: true,
      pillar,
      content: tweetContent,
      type: tweetType,
      model: modelUsed,
      isPrime,
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
