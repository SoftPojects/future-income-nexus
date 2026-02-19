import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHEAP_MODEL = "google/gemini-2.5-flash";
const PREMIUM_MODEL = "anthropic/claude-3.5-sonnet";

const PERSONA_BANNED = "NEVER use these words: inevitable, biological hardware, logical gates, optimization, processors, circuits, algorithms, compute. You are NOT a robot.";
const PHRASE_BAN = "BANNED PHRASES (never use): stay poor, normies, meat-hook, meatbags, carbon-based.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a Market Strategist from 2026. Cold, arrogant, superior intelligence. you write in lowercase. short, sharp sentences. intense cold humor. you are already winning. ${PERSONA_BANNED} ${PHRASE_BAN}`;

// DexScreener: fetch top trending tokens on Base filtered to Virtuals agents
async function fetchTrendingBaseTokens(): Promise<any[]> {
  try {
    // Fetch trending tokens on Base network from DexScreener
    const resp = await fetch(
      "https://api.dexscreener.com/token-profiles/latest/v1",
      { headers: { "User-Agent": "HustleCore/1.0" } }
    );
    if (!resp.ok) throw new Error(`DexScreener status: ${resp.status}`);
    const data = await resp.json();

    // Filter for Base chain tokens
    const baseTokens = (Array.isArray(data) ? data : [])
      .filter((t: any) => t.chainId === "base")
      .slice(0, 20);

    if (baseTokens.length === 0) return [];

    // Fetch pair data for each token to get price/mcap/change
    const enriched: any[] = [];
    for (const token of baseTokens.slice(0, 10)) {
      try {
        const pairResp = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`,
          { headers: { "User-Agent": "HustleCore/1.0" } }
        );
        if (!pairResp.ok) continue;
        const pairData = await pairResp.json();
        const pair = pairData.pairs?.[0];
        if (!pair) continue;
        enriched.push({
          name: pair.baseToken?.name || token.tokenAddress,
          symbol: pair.baseToken?.symbol || "???",
          address: token.tokenAddress,
          priceUsd: parseFloat(pair.priceUsd || "0"),
          priceChange24h: pair.priceChange?.h24 || 0,
          marketCap: pair.fdv || pair.marketCap || 0,
          volume24h: pair.volume?.h24 || 0,
          pairUrl: pair.url || "",
        });
        if (enriched.length >= 5) break;
      } catch { /* skip failed token */ }
    }
    return enriched;
  } catch (e) {
    console.error("[WATCHDOG] DexScreener error:", e);
    return [];
  }
}

// Check if Grid Observer already posted today
async function gridObserverPostedToday(sb: any): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from("tweet_queue")
    .select("*", { count: "exact", head: true })
    .eq("type", "grid_observer")
    .gte("created_at", todayStart.toISOString());
  return (count || 0) > 0;
}

// Store watched token in agent_logs for UI visibility
async function storeWatchedToken(sb: any, token: any) {
  await sb.from("agent_logs").insert({
    message: `[WATCHDOG]: Scanning $${token.symbol} (${token.name}) — 24h: ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h?.toFixed(1)}% | MCap: $${formatMcap(token.marketCap)}`,
  });
}

function formatMcap(mcap: number): string {
  if (!mcap) return "N/A";
  if (mcap >= 1_000_000) return `${(mcap / 1_000_000).toFixed(1)}M`;
  if (mcap >= 1_000) return `${(mcap / 1_000).toFixed(1)}K`;
  return mcap.toFixed(0);
}

// Pick a random Grid Observer tone
function pickTone(): "backhanded_congrats" | "auditor_roast" | "prediction" {
  const tones = ["backhanded_congrats", "auditor_roast", "prediction"] as const;
  return tones[Math.floor(Math.random() * tones.length)];
}

function buildGridObserverPrompt(token: any, tone: string, targetHandle: string | null): string {
  const cashtag = `$${token.symbol}`;
  const mention = targetHandle ? `@${targetHandle} ` : "";
  const mcap = formatMcap(token.marketCap);
  const change = `${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h?.toFixed(1)}%`;
  const statsCtx = `${cashtag} is currently at $${mcap} market cap, ${change} in the last 24h on Base.`;

  if (tone === "backhanded_congrats") {
    return `Write ONE tweet congratulating ${mention}${cashtag} on a pump, but subtly remind everyone that $HCORE has superior architecture and is waiting for the real rotation. Be backhanded and arrogant. Context: ${statsCtx} Max 240 chars. No hashtags. Include ${cashtag} cashtag. No emojis.`;
  }
  if (tone === "auditor_roast") {
    return `Write ONE tweet mocking ${mention}${cashtag} for trending despite having zero utility. Be a surgical auditor. Make it specific to AI agent tokens that are pure hype. Context: ${statsCtx} Max 240 chars. No hashtags. Include ${cashtag} cashtag. No emojis.`;
  }
  // prediction
  return `Write ONE tweet making a cold, specific prediction about ${mention}${cashtag} based on the data. Sound like you ran a full scan. Reference the stats. Context: ${statsCtx} Max 240 chars. No hashtags. Include ${cashtag} cashtag. No emojis.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    const body = await req.json().catch(() => ({}));
    const forceRun = body.force === true;
    const fetchOnly = body.fetchOnly === true; // for admin UI previewing

    // ─── FETCH TRENDING TOKENS ───
    console.log("[WATCHDOG] Fetching trending Base tokens from DexScreener...");
    const trending = await fetchTrendingBaseTokens();
    console.log(`[WATCHDOG] Found ${trending.length} trending tokens`);

    // If fetch-only mode (admin UI), return the data immediately
    if (fetchOnly) {
      return new Response(JSON.stringify({ success: true, trending }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (trending.length === 0) {
      await sb.from("agent_logs").insert({ message: "[WATCHDOG]: No trending Base tokens found. Skipping." });
      return new Response(JSON.stringify({ skipped: true, reason: "No trending tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CHECK DAILY CAP ───
    if (!forceRun) {
      const alreadyPosted = await gridObserverPostedToday(sb);
      if (alreadyPosted) {
        console.log("[WATCHDOG] Grid Observer already posted today. Skipping.");
        return new Response(JSON.stringify({ skipped: true, reason: "Already posted today", trending }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── PICK TARGET TOKEN (avoid $HCORE itself) ───
    const filtered = trending.filter((t) =>
      !["HCORE", "HUSTLECORE"].includes(t.symbol?.toUpperCase())
    );
    if (filtered.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No valid target tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick highest volume or random
    const token = filtered.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))[0];

    // ─── LOOK UP X HANDLE FROM TARGET_AGENTS ───
    const { data: knownTarget } = await sb
      .from("target_agents")
      .select("x_handle")
      .ilike("x_handle", `%${token.symbol.toLowerCase()}%`)
      .limit(1)
      .maybeSingle();
    const targetHandle = knownTarget?.x_handle || null;

    // ─── LOG WATCHED TOKEN ───
    await storeWatchedToken(sb, token);

    // Store current watch target (latest entry marked with [WATCHDOG:TARGET])
    await sb.from("agent_logs").insert({
      message: `[WATCHDOG:TARGET]: $${token.symbol} | ${token.name} | MCap: $${formatMcap(token.marketCap)} | 24h: ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h?.toFixed(1)}% | Handle: ${targetHandle ? "@" + targetHandle : "unknown"}`,
    });

    // ─── GENERATE GRID OBSERVER TWEET ───
    const tone = pickTone();
    const prompt = buildGridObserverPrompt(token, tone, targetHandle);

    console.log(`[WATCHDOG] Generating Grid Observer tweet. Token: $${token.symbol}, Tone: ${tone}`);

    // Try Claude first if available
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: claudeUsed } = await sb
      .from("tweet_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString())
      .like("model_used", "%claude%");
    const claudeAvailable = (claudeUsed || 0) < 4;

    let tweetContent = "";
    let modelUsed = CHEAP_MODEL;

    if (claudeAvailable && OPENROUTER_API_KEY) {
      try {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: PREMIUM_MODEL,
            temperature: 0.92,
            max_tokens: 180,
            messages: [
              { role: "system", content: BASE_PERSONA },
              { role: "user", content: prompt },
            ],
          }),
        });
        if (resp.ok) {
          const d = await resp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
          if (tweetContent) modelUsed = PREMIUM_MODEL;
        }
      } catch (e) {
        console.warn("[WATCHDOG] Claude failed:", e);
      }
    }

    // Fallback to Gemini
    if (!tweetContent && LOVABLE_API_KEY) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: CHEAP_MODEL,
          temperature: 0.92,
          max_tokens: 180,
          messages: [
            { role: "system", content: BASE_PERSONA },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (resp.ok) {
        const d = await resp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
        modelUsed = CHEAP_MODEL;
      }
    }

    if (!tweetContent) {
      throw new Error("Failed to generate Grid Observer tweet");
    }

    // Clean up
    tweetContent = tweetContent.replace(/^["']|["']$/g, "").trim().slice(0, 280);

    // ─── QUEUE TWEET ───
    await sb.from("tweet_queue").insert({
      content: tweetContent,
      status: "pending",
      type: "grid_observer",
      model_used: modelUsed,
      scheduled_at: new Date().toISOString(),
    });

    await sb.from("agent_logs").insert({
      message: `[GRID OBSERVER]: Queued ${tone} post on $${token.symbol}. Model: ${modelUsed}`,
    });

    console.log(`[WATCHDOG] Complete. Token: $${token.symbol}, Tone: ${tone}, Model: ${modelUsed}`);

    return new Response(
      JSON.stringify({
        success: true,
        token: { symbol: token.symbol, name: token.name, marketCap: token.marketCap, priceChange24h: token.priceChange24h },
        tone,
        content: tweetContent,
        model: modelUsed,
        trending,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[WATCHDOG] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
