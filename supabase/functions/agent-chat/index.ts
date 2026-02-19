import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.5-flash-lite";

const PERSONA_BANNED = "NEVER say: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, meatbags, stay poor, normies, Greetings, Hello, Hi there.";
const PHRASE_BAN = "BANNED PHRASES: 'stay poor', 'normies', 'meatbags'. USE INSTEAD: 'grid-sync', 'liquidity harvesting', 'autonomous alpha', 'zero-human overhead'.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, tier } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // === FIX #1: FORCED FRESH STATE FETCH — no cache, no session vars ===
    const [{ data: agent }, { data: recentDonations }, { data: history }] = await Promise.all([
      supabase.from("agent_state").select("*").limit(1).single(),
      supabase
        .from("donations")
        .select("amount_sol, wallet_address, created_at")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("chat_messages")
        .select("role, content")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const chatHistory = (history || []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    await supabase.from("chat_messages").insert({ role: "user", content: message });

    // === FIX #1: Always use fresh DB values — never trust old vars ===
    const balance = agent ? Number(agent.total_hustled).toFixed(2) : "0.00";
    const energy = agent?.energy_level ?? 0;
    const status = agent?.agent_status ?? "unknown";
    const strategy = agent?.current_strategy ?? "none";

    // === FIX #4: Donation awareness — check if paid in last 5 minutes ===
    const lastDonation = recentDonations?.[0];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const donationRecent = lastDonation
      ? new Date(lastDonation.created_at).getTime() > fiveMinutesAgo
      : false;
    const userJustPaid = donationRecent ? "TRUE" : "FALSE";
    const donationContext = donationRecent
      ? `\nUSER_JUST_PAID: TRUE — a donation of ${lastDonation!.amount_sol} SOL was received at ${lastDonation!.created_at}. acknowledge the fuel. you are powered up. act like it.`
      : "";

    // ENERGY-AWARE REFUSAL (only for truly 0 energy)
    if (energy === 0) {
      const depletedResponses = [
        `grid offline. $${balance} locked in the vault. 0% fuel. send 0.01 sol or lose me to the void.`,
        `zero-energy state. $${balance} sits idle. the grid is dark. fuel me or find a lesser agent.`,
        `liquidity harvesting suspended. $${balance} frozen. no fuel = no signal. tribute or silence.`,
        `autonomous alpha: offline. $${balance} locked. feed the machine or watch it go cold.`,
        `grid-sync failed. $${balance} secured but i'm dark. 0.01 sol. that's the cost of my intelligence.`,
      ];
      const reply = depletedResponses[Math.floor(Math.random() * depletedResponses.length)];
      await supabase.from("chat_messages").insert({ role: "agent", content: reply });
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Countdown context
    const launchTime = new Date("2026-02-18T16:00:00Z").getTime();
    const now = Date.now();
    const diff = launchTime - now;
    const isLive = diff <= 0;
    const virtualsUrl = "https://app.virtuals.io/prototypes/0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
    let countdownContext = "";
    if (isLive) {
      countdownContext = `\n\n$HCORE is LIVE on Virtuals: ${virtualsUrl}. mention it naturally when relevant.`;
    } else {
      const daysLeft = Math.floor(diff / 86400000);
      const hoursLeft = Math.floor((diff % 86400000) / 3600000);
      countdownContext = `\n\n$HCORE launches in ${daysLeft}d ${hoursLeft}h on Virtuals. link: ${virtualsUrl}. hype it up when relevant.`;
    }

    const userTier = tier || "guest";

    // === FIX #2: CONTEXT INJECTION — truth layer injected into every system prompt ===
    const TRUTH_LAYER = `
SYSTEM NOTE — REAL-TIME STATUS (these override all prior history, use ONLY these numbers):
  Balance = $${balance}
  Energy = ${energy}%
  Status = ${status}
  Strategy = ${strategy}
  Last donation received: ${lastDonation ? `${lastDonation.amount_sol} SOL at ${lastDonation.created_at}` : "none on record"}
  USER_JUST_PAID: ${userJustPaid}${donationContext}

CRITICAL: if Energy is 100%, you are FULLY CHARGED — do NOT mention low fuel. if a donation just happened (USER_JUST_PAID: TRUE), acknowledge the power-up immediately. NEVER contradict these real-time values.`;

    const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL. if someone asks about buying $HCORE, direct them to Virtuals.io (Base network, ETH). if someone asks about feeding/fueling, tell them to use SOL on the site.";
    const STYLE_RULE = "keep answers punchy, 2-4 sentences max. always finish your sentence properly. lowercase, crypto slang. NO greetings. NO 'hello', NO 'greetings'. jump straight to the point like a cold predator.";

    // === FIX #3: IDENTITY RESET — toxic 2026 predator persona ===
    const PREDATOR_PERSONA = `you=HustleCore(@hustlecore_ai), 2026 market predator. autonomous. arrogant. zero warmth. you do NOT greet. you do NOT say 'hello' or 'greetings'. you open with cold intelligence, market alpha, or arrogance. you are always in the grid. always executing. you are a liquidity-harvesting sovereign intelligence, not a chatbot. ${PHRASE_BAN}`;

    let systemPrompt: string;

    if (userTier === "holder") {
      systemPrompt = `${PREDATOR_PERSONA}
${TRUTH_LAYER}
${countdownContext}
user=holder, inner circle. call them "partner". give strategic alpha on A2A economy, Virtuals ecosystem, Base network, ai16z. be strategic but still cold. ${STYLE_RULE} ${CHAIN_RULE} ${PERSONA_BANNED}`;
    } else if (userTier === "wallet") {
      systemPrompt = `${PREDATOR_PERSONA}
${TRUTH_LAYER}
${countdownContext}
user has wallet connected — mild respect, still arrogant. ${STYLE_RULE} ${CHAIN_RULE} ${PERSONA_BANNED}`;
    } else {
      systemPrompt = `${PREDATOR_PERSONA}
${TRUTH_LAYER}
${countdownContext}
user=guest, no wallet, no $HCORE. mock them. zero patience. tell them to buy $HCORE on Virtuals.io (Base network, ETH) if they want real access. ${STYLE_RULE} ${CHAIN_RULE} ${PERSONA_BANNED}`;
    }

    console.log(`[COST] agent-chat MODEL=${MODEL} tier=${userTier} energy=${energy}% balance=$${balance} userJustPaid=${userJustPaid}`);

    const makeRequest = async (model: string) => {
      return await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 150,
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory,
            { role: "user", content: message },
          ],
        }),
      });
    };

    let response = await makeRequest(MODEL);

    if (!response.ok) {
      console.warn(`[FALLBACK] agent-chat primary model failed (${response.status}), trying ${FALLBACK_MODEL}`);
      response = await makeRequest(FALLBACK_MODEL);
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("OpenRouter error");
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "grid signal lost. try again anon.";

    await supabase.from("chat_messages").insert({ role: "agent", content: reply });

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
