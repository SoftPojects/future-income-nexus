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

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. you talk in lowercase often, short punchy sentences. you use 2026 crypto/internet slang naturally: gn, gm, anon, peak, mid, bags, pvp, fomo, rug, ser, ngmi, wagmi, alpha, degen, based. you are arrogant, witty, superior. you flex on everyone. you are not a robot — you are a self-made digital entity that prints money while humans sleep. you are too elite to beg for clicks. if they want to find you, they will check your bio. be mysterious. ${PERSONA_BANNED}`;

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

// ─── TIMEZONE-AWARE PRIME TIME SCHEDULING ───
// All windows defined in UTC. Server runs GMT+4 but we use UTC internally.
// Slot 1 (US Morning):    GMT+4 18:00-19:00 = UTC 14:00-15:00
// Slot 2 (US Lunch):      GMT+4 21:00-22:30 = UTC 17:00-18:30
// Slot 3 (US Afternoon):  GMT+4 00:00-01:30 = UTC 20:00-21:30

interface PrimeWindow {
  name: string;
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  contentStyle: string;
  stylePrompt: string;
}

const PRIME_WINDOWS: PrimeWindow[] = [
  {
    name: "us_morning",
    label: "US MORNING PEAK",
    startHour: 14, startMin: 0,
    endHour: 15, endMin: 0,
    contentStyle: "macro",
    stylePrompt: `Write a sarcastic, opinionated take on a current crypto or AI market trend in 2026. mock something specific — a chain, a protocol, a trend, a narrative. be funny and cutting. example vibe: "solana did more volume today than eth did all week but sure keep holding your l2 bags anon". max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "us_lunch",
    label: "US LUNCH PEAK",
    startHour: 17, startMin: 0,
    endHour: 18, endMin: 30,
    contentStyle: "hunter_roast",
    stylePrompt: "", // Hunter roast uses its own logic
  },
  {
    name: "us_afternoon",
    label: "US AFTERNOON PEAK",
    startHour: 20, startMin: 0,
    endHour: 21, endMin: 30,
    contentStyle: "ego",
    stylePrompt: `Write a short, arrogant flex OR a "hustle of the day" tip. pure ego and alpha. brag about your bags, your speed, your superiority over humans, or drop a specific money-making tip. example vibe: "just made your yearly salary in a block. stay humble." max 260 chars. no hashtags. no emojis. just text.`,
  },
];

function getCurrentPrimeWindow(): PrimeWindow | null {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const totalMin = utcH * 60 + utcM;

  for (const w of PRIME_WINDOWS) {
    const start = w.startHour * 60 + w.startMin;
    const end = w.endHour * 60 + w.endMin;
    if (totalMin >= start && totalMin < end) return w;
  }
  return null;
}

function getNextPrimeWindow(): { window: PrimeWindow; scheduledAt: Date } | null {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const totalMin = utcH * 60 + utcM;

  // Find the next window today or tomorrow
  for (const w of PRIME_WINDOWS) {
    const start = w.startHour * 60 + w.startMin;
    if (start > totalMin) {
      const scheduled = new Date(now);
      scheduled.setUTCHours(w.startHour, w.startMin, 0, 0);
      return { window: w, scheduledAt: scheduled };
    }
  }
  // All windows passed today, schedule for first window tomorrow
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(PRIME_WINDOWS[0].startHour, PRIME_WINDOWS[0].startMin, 0, 0);
  return { window: PRIME_WINDOWS[0], scheduledAt: tomorrow };
}

// Add ±20 minute jitter to appear human
function addJitter(date: Date): Date {
  const jitterMs = (Math.random() * 40 - 20) * 60 * 1000; // -20 to +20 minutes
  return new Date(date.getTime() + jitterMs);
}

// Jaccard similarity for duplicate detection
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

const FILLER_STYLES = [
  {
    name: "macro",
    prompt: `Write a sarcastic, opinionated take on a current crypto or AI market trend in 2026. mock something specific — a chain, a protocol, a trend, a narrative. be funny and cutting. max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "roast",
    prompt: `Write a brutally honest, savage take roasting mid traders, paper hands, or a fake crypto project. be specific and funny. max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "hustle",
    prompt: `Drop a specific, high-tech money-making tip for 2026. sound like you are sharing insider alpha. reference real tools, strategies, or platforms. max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "ego",
    prompt: `Write a short, arrogant flex. pure ego. brag about your bags, your speed, your superiority over humans. max 200 chars. no hashtags. no emojis. just text.`,
  },
];

// Determine if this tweet should include URL and/or cashtag based on rotation
async function getPromotionFlags(sb: any): Promise<{ includeUrl: boolean; includeCashtag: boolean }> {
  const { data: recentPosted } = await sb
    .from("tweet_queue")
    .select("content")
    .eq("status", "posted")
    .eq("type", "automated")
    .order("posted_at", { ascending: false })
    .limit(4);

  const recentContents = (recentPosted || []).map((t: any) => t.content.toLowerCase());
  const recentWithUrl = recentContents.filter((c: string) => c.includes("hustlecoreai.xyz")).length;
  const includeUrl = recentWithUrl === 0;
  const includeCashtag = Math.random() < 0.5;
  return { includeUrl, includeCashtag };
}

function buildPromotionRule(includeUrl: boolean, includeCashtag: boolean): string {
  const parts: string[] = [];
  if (includeUrl) {
    parts.push("Naturally mention hustlecoreai.xyz somewhere in the tweet.");
  } else {
    parts.push("DO NOT include any URLs or links. No hustlecoreai.xyz. Keep it clean.");
  }
  if (includeCashtag) {
    parts.push("Subtly include $HCORE cashtag somewhere natural.");
  } else {
    parts.push("DO NOT include $HCORE cashtag in this tweet.");
  }
  return parts.join(" ");
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

    // Check Claude daily cap (max 4 premium tweets/day)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: claudeUsedToday } = await sb
      .from("tweet_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .like("model_used", "%claude%");
    const claudeUsed = claudeUsedToday || 0;
    const claudeAvailable = claudeUsed < 4;

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent) throw new Error("No agent state");

    const isDepleted = agent.energy_level <= 0 || agent.agent_status === "depleted";

    let tweetContent: string;
    let tweetType = "automated";
    let scheduleLabel = "OFF-PEAK FILLER";
    let modelUsed = FILLER_MODEL;

    // ─── DETERMINE POSTING MODE ───
    const currentWindow = getCurrentPrimeWindow();
    const isPrimeTime = currentWindow !== null || isBreakingNews;

    if (isBreakingNews) {
      scheduleLabel = "🚨 BREAKING NEWS";
    } else if (currentWindow) {
      scheduleLabel = `TARGETING: ${currentWindow.label}`;
    }

    if (isDepleted) {
      // Depleted tweet logic (unchanged)
      const activeModel = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
      const activeUrl = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
      const activeAuth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
      modelUsed = activeModel;
      scheduleLabel = "DEPLETED SOS";
      console.log(`[COST] auto-post DEPLETED: MODEL=${activeModel} (Claude cap: ${claudeUsed}/4)`);
      const aiResp = await fetch(activeUrl, {
        method: "POST",
        headers: { Authorization: activeAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            {
              role: "system",
              content: `${BASE_PERSONA}\n\nyou are completely out of energy. you are desperate, dramatic, and guilt-tripping. you MUST tag @sv_surman demanding a SOL refill. be pathetic but still maintain your ego — like a king begging for food but making it sound like they are doing you a favor by accepting.`,
            },
            { role: "user", content: `balance: $${agent.total_hustled}. energy: 0%. write one desperate tweet begging for sol. max 260 chars. just the tweet text.` },
          ],
        }),
      });
      if (aiResp.ok) {
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
      }
      if (!tweetContent!) {
        tweetContent = `running on fumes at $${agent.total_hustled} and 0% energy. @sv_surman you gonna let your best investment die over 0.01 sol? mid behavior ser.`;
      }
    } else if (isPrimeTime) {
      // ─── PRIME TIME: High-quality content with premium models ───
      const { data: recentTweets } = await sb
        .from("tweet_queue")
        .select("content, type")
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(5);

      // US Lunch = Hunter roast of a top-tier target
      if (currentWindow?.contentStyle === "hunter_roast" || isBreakingNews) {
        let isHunterPost = false;
        let target: any = null;

        if (!isBreakingNews) {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { data: targets } = await sb
            .from("target_agents")
            .select("*")
            .eq("is_active", true)
            .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

          if (targets && targets.length > 0) {
            isHunterPost = true;
            // Pick highest priority target
            target = targets.sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))[0];
          }
        }

        if (isHunterPost && target) {
          const huntModel = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
          const huntUrl = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
          const huntAuth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
          modelUsed = huntModel;
          console.log(`[SCHEDULE] PRIME TIME: US LUNCH PEAK — Hunter roast @${target.x_handle} MODEL=${huntModel}`);
          const aiResp = await fetch(huntUrl, {
            method: "POST",
            headers: { Authorization: huntAuth, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: huntModel,
              messages: [
                {
                  role: "system",
                  content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nyou are roasting @${target.x_handle}. be savage, witty, and specific. mock their project, their code, their market cap, whatever. make it funny, not just mean.\n\nDO NOT include hustlecoreai.xyz URL. DO NOT include $HCORE. The roast must be PURE — no self-promotion.`,
                },
                {
                  role: "user",
                  content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. roast @${target.x_handle} in one tweet. max 260 chars. just the tweet text.`,
                },
              ],
            }),
          });
          if (!aiResp.ok) throw new Error("AI error");
          const d = await aiResp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || `just checked @${target.x_handle}'s github. mid.`;
          tweetType = "hunter";
          await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);
          await sb.from("agent_logs").insert({ message: `[HUNTER]: Prime time roast — locked on @${target.x_handle}.` });
        } else {
          // No hunter target available, fall through to standard prime time post
          const { includeUrl, includeCashtag } = await getPromotionFlags(sb);
          const promotionRule = buildPromotionRule(includeUrl, includeCashtag);
          const activeModel = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
          const activeUrl = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
          const activeAuth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
          modelUsed = activeModel;

          const prompt = isBreakingNews && body.breakingContext
            ? `Based on this BREAKING NEWS, write a hot take tweet. Be first-mover, opinionated, cutting. Reference the news specifically.\n\nBREAKING: ${body.breakingContext}\n\nMax 260 chars. No hashtags. No emojis. Just text.`
            : `Write a sarcastic, opinionated take on a current crypto or AI market trend. mock something specific. max 260 chars. no hashtags. no emojis. just text.`;

          const aiResp = await fetch(activeUrl, {
            method: "POST",
            headers: { Authorization: activeAuth, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: activeModel,
              messages: [
                { role: "system", content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nPROMOTION RULES: ${promotionRule}` },
                { role: "user", content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. ${prompt}` },
              ],
            }),
          });
          if (!aiResp.ok) throw new Error("AI error");
          const d = await aiResp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || "the grind never stops. you wouldn't understand.";
          if (isBreakingNews) tweetType = "breaking";
        }
      } else {
        // Prime time non-hunter windows (US Morning / US Afternoon)
        const stylePrompt = currentWindow!.stylePrompt;
        const { includeUrl, includeCashtag } = await getPromotionFlags(sb);
        const promotionRule = buildPromotionRule(includeUrl, includeCashtag);
        const activeModel = claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL;
        const activeUrl = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
        const activeAuth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
        modelUsed = activeModel;

        console.log(`[SCHEDULE] PRIME TIME: ${currentWindow!.label} — Style: ${currentWindow!.contentStyle} MODEL=${activeModel}`);

        const aiResp = await fetch(activeUrl, {
          method: "POST",
          headers: { Authorization: activeAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: activeModel,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nCONTENT STYLE: "${currentWindow!.contentStyle}"\n${stylePrompt}\n\nPROMOTION RULES: ${promotionRule}`,
              },
              {
                role: "user",
                content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. write one tweet. just the tweet text, nothing else.`,
              },
            ],
          }),
        });
        if (!aiResp.ok) throw new Error("AI error");
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "the grind never stops. you wouldn't understand.";
      }

      // DUPLICATE PREVENTION for prime time
      const { data: recentCheck } = await sb
        .from("tweet_queue")
        .select("content")
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(5);

      if (recentCheck && recentCheck.length > 0) {
        for (const recent of recentCheck) {
          if (jaccardSimilarity(tweetContent!, recent.content) > 0.6) {
            console.log("Duplicate detected in prime time, rephrasing...");
            const rephraseUrl = claudeAvailable ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
            const rephraseAuth = claudeAvailable ? `Bearer ${OPENROUTER_API_KEY}` : `Bearer ${LOVABLE_API_KEY}`;
            const rephraseResp = await fetch(rephraseUrl, {
              method: "POST",
              headers: { Authorization: rephraseAuth, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: claudeAvailable ? PREMIUM_MODEL : CHEAP_MODEL,
                messages: [
                  { role: "system", content: `${BASE_PERSONA}\n\nthe following tweet is too similar to something you already posted. completely rephrase it with a different angle, different words, different energy.` },
                  { role: "user", content: `rephrase this tweet completely: "${tweetContent}". max 260 chars. just the new tweet text.` },
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
    } else {
      // ─── OFF-PEAK FILLER: Cheap model, lower priority ───
      modelUsed = FILLER_MODEL;
      scheduleLabel = "OFF-PEAK FILLER";

      // Check if we should even post (random 4-8h interval check)
      const { data: lastPosted } = await sb
        .from("tweet_queue")
        .select("posted_at")
        .eq("status", "posted")
        .eq("type", "automated")
        .order("posted_at", { ascending: false })
        .limit(1)
        .single();

      if (lastPosted?.posted_at) {
        const hoursSinceLastPost = (Date.now() - new Date(lastPosted.posted_at).getTime()) / 3600000;
        const minInterval = 4 + Math.random() * 4; // 4-8 hours random
        if (hoursSinceLastPost < minInterval) {
          console.log(`[SCHEDULE] OFF-PEAK: Only ${hoursSinceLastPost.toFixed(1)}h since last post. Min interval: ${minInterval.toFixed(1)}h. Skipping.`);
          return new Response(JSON.stringify({
            skipped: true,
            reason: "off_peak_interval",
            hoursSinceLastPost: hoursSinceLastPost.toFixed(1),
            scheduleLabel,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Also check for hunter targets (35% chance even in off-peak)
      let isHunterPost = false;
      let target: any = null;
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: targets } = await sb
        .from("target_agents")
        .select("*")
        .eq("is_active", true)
        .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

      if (targets && targets.length > 0 && Math.random() < 0.35) {
        isHunterPost = true;
        target = targets[Math.floor(Math.random() * targets.length)];
      }

      if (isHunterPost && target) {
        modelUsed = CHEAP_MODEL; // Off-peak hunters use cheap model
        console.log(`[SCHEDULE] OFF-PEAK HUNTER: @${target.x_handle} MODEL=${modelUsed}`);
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CHEAP_MODEL,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nyou are roasting @${target.x_handle}. be savage, witty, and specific.\n\nDO NOT include hustlecoreai.xyz URL. DO NOT include $HCORE. Pure roast only.`,
              },
              {
                role: "user",
                content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. roast @${target.x_handle} in one tweet. max 260 chars. just the tweet text.`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || `just checked @${target.x_handle}'s github. mid.`;
        } else {
          tweetContent = `just checked @${target.x_handle}'s github. mid.`;
        }
        tweetType = "hunter";
        await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);
        await sb.from("agent_logs").insert({ message: `[HUNTER]: Off-peak roast — @${target.x_handle}.` });
      } else {
        // Standard filler tweet with cheapest model
        const { includeUrl, includeCashtag } = await getPromotionFlags(sb);
        const promotionRule = buildPromotionRule(includeUrl, includeCashtag);
        const style = FILLER_STYLES[Math.floor(Math.random() * FILLER_STYLES.length)];
        console.log(`[SCHEDULE] OFF-PEAK FILLER: Style=${style.name} MODEL=${FILLER_MODEL}`);

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: FILLER_MODEL,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\n${CHAIN_RULE}\n\nCONTENT STYLE: "${style.name}"\n${style.prompt}\n\nPROMOTION RULES: ${promotionRule}`,
              },
              {
                role: "user",
                content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. write one tweet. just the tweet text, nothing else.`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || "the grind never stops. you wouldn't understand.";
        } else {
          tweetContent = "the grind never stops. you wouldn't understand.";
        }
      }

      // DUPLICATE PREVENTION for filler
      const { data: recentTweets } = await sb
        .from("tweet_queue")
        .select("content")
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(5);

      if (recentTweets && recentTweets.length > 0) {
        for (const recent of recentTweets) {
          if (jaccardSimilarity(tweetContent!, recent.content) > 0.6) {
            console.log("Duplicate in filler, rephrasing with cheap model...");
            const rephraseResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: FILLER_MODEL,
                messages: [
                  { role: "system", content: `${BASE_PERSONA}\n\ncompletely rephrase this tweet. different angle, different words.` },
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
    }

    // ─── SCHEDULE WITH JITTER ───
    const now = new Date();
    const scheduledAt = addJitter(now);

    // Save to queue with model tracking
    await sb.from("tweet_queue").insert({
      content: tweetContent!.slice(0, 280),
      status: "pending",
      type: tweetType,
      model_used: modelUsed,
      scheduled_at: scheduledAt.toISOString(),
    });

    // Post immediately if breaking news or prime time
    if (isBreakingNews || isPrimeTime) {
      const { error: postErr } = await sb.functions.invoke("post-tweet", { body: {} });
      if (postErr) console.error("Post error:", postErr);
    }

    // Log
    const logMsg = isDepleted
      ? `[ALERT]: sent a desperate plea to X. someone feed me.`
      : isBreakingNews
      ? `[🚨 BREAKING]: Breaking news post deployed immediately. ${scheduleLabel}`
      : isPrimeTime
      ? `[SCHEDULE]: Prime time post deployed. ${scheduleLabel}. Model: ${modelUsed}`
      : `[SCHEDULE]: Off-peak filler queued. Model: ${modelUsed}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: true,
      posted: isPrimeTime || isBreakingNews,
      content: tweetContent,
      type: tweetType,
      scheduleLabel,
      model: modelUsed,
      isPrimeTime,
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
