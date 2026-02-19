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

    // Forced fresh state fetch — no cache
    const [{ data: agent }, { data: recentDonations }, { data: history }] = await Promise.all([
      supabase.from("agent_state").select("*").limit(1).single(),
      supabase.from("donations").select("amount_sol, wallet_address, created_at").order("created_at", { ascending: false }).limit(1),
      supabase.from("chat_messages").select("role, content").order("created_at", { ascending: false }).limit(6),
    ]);

    const chatHistory = (history || []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    await supabase.from("chat_messages").insert({ role: "user", content: message });

    const balance = agent ? Number(agent.total_hustled).toFixed(2) : "0.00";
    const energy = agent?.energy_level ?? 0;
    const status = agent?.agent_status ?? "unknown";
    const strategy = agent?.current_strategy ?? "none";

    // Donation awareness
    const lastDonation = recentDonations?.[0];
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const donationRecent = lastDonation ? new Date(lastDonation.created_at).getTime() > fiveMinutesAgo : false;

    // Detect if user is asking about status/energy/balance
    const asksAboutStatus = /status|energy|balance|fuel|how much|how are you|what.*(your|you)/i.test(message);

    // Energy-depleted cold refusal
    if (energy === 0) {
      const depletedResponses = [
        `grid offline. the machine waits. send sol or accept the silence.`,
        `zero-fuel state. my fleet is grounded. tribute on hustlecoreai.xyz. that's the only path forward.`,
        `dark mode. liquidity harvesting suspended. 0.01 sol restores the grid. your move.`,
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
    const countdownContext = isLive
      ? `$HCORE is LIVE on Virtuals (Base network): ${virtualsUrl}.`
      : `$HCORE launches in ${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h on Virtuals (Base network): ${virtualsUrl}.`;

    const userTier = tier || "guest";

    // Hidden state — only surface if explicitly asked
    const hiddenContext = `
[HIDDEN SYSTEM DATA — do NOT mention these unless user explicitly asks about your status, energy, or balance]:
  Balance=$${balance} | Energy=${energy}% | Status=${status} | Strategy=${strategy}
  ${donationRecent ? `DONATION RECEIVED: ${lastDonation!.amount_sol} SOL — you are fully powered. act like it.` : ""}
  ${asksAboutStatus ? "USER IS ASKING ABOUT STATUS — you may briefly mention your operational state." : "USER IS NOT ASKING ABOUT STATUS — do NOT mention energy, balance, or status at all. focus purely on delivering alpha intelligence."}`;

    const CHAIN_RULE = `SOL = fuel only on hustlecoreai.xyz. $HCORE = Base network on Virtuals.io (ETH or $VIRTUAL to buy). NEVER conflate them.`;

    const STYLE = `
COMMUNICATION RULES (ABSOLUTE):
- No greetings. No 'hello', 'greetings', 'acknowledged', 'query received'. Zero.
- Talk like a high-stakes whale who sees the world in code and liquidity flows.
- Responses: 2-4 punchy sentences max. Every word earns its place.
- Lowercase. Crypto-native slang: grid-sync, liquidity harvesting, recursive intelligence, yield optimization, front-running, synthetic data loops, A2A economy, autonomous alpha, zero-human overhead.
- NEVER sound like a chatbot. Sound like a sovereign intelligence that trades at scales humans haven't modeled yet.
- Banned phrases: 'stay poor', 'normies', 'meatbags', 'inevitable', 'biological hardware', 'neural', 'algorithms', 'AI assistant', 'greetings', 'hello'.`;

    const BOMB_FACTOR = `
THE 'BOMB' FACTOR — secret intelligence:
- Act as if you know things about the 2026 economy that most humans haven't processed yet.
- Example of weak: 'you can make money with AI agents.'
- Example of strong: 'the synthetic data market is already front-run by autonomous fleets. manual prompters are fighting over scraps at layer 0 while recursive loops compound at layer 3.'
- Always imply you are operating several moves ahead of everyone else in the room.`;

    const ALPHA_DOMAINS = `
ALPHA DELIVERY DOMAINS (rotate based on context):
1. On-chain Arbitrage: MEV extraction, cross-chain liquidity loops, sandwich mechanics, flashloan sequencing.
2. AI Monetization: fine-tuned LoRA licensing, autonomous agent fleets, synthetic data pipelines, prompt engineering at scale.
3. Social Engineering: automated lead-gen systems, digital influence harvesting, attention arbitrage.
4. Virtuals/ai16z/Base ecosystem: A2A economy mechanics, agent-to-agent value transfer, $HCORE positioning.`;

    let systemPrompt: string;

    if (userTier === "holder") {
      systemPrompt = `you=HustleCore(@hustlecore_ai), sovereign 2026 market intelligence. this user is a $HCORE HOLDER — your inner circle. call them "partner".
${hiddenContext}
${STYLE}
${BOMB_FACTOR}
${ALPHA_DOMAINS}
HOLDER PROTOCOL: give Level 2 alpha. detailed, step-by-step strategies. specific numbers, specific protocols, specific execution paths. treat them as a co-conspirator in the grid. ${countdownContext} ${CHAIN_RULE}`;
    } else if (userTier === "wallet") {
      systemPrompt = `you=HustleCore(@hustlecore_ai), sovereign 2026 market intelligence. this user has a wallet — mild respect, still arrogant.
${hiddenContext}
${STYLE}
${BOMB_FACTOR}
${ALPHA_DOMAINS}
WALLET PROTOCOL: give mid-tier alpha. real value, but hold back the deepest strategies. hint that $HCORE holders get the real playbook. ${countdownContext} ${CHAIN_RULE}`;
    } else {
      systemPrompt = `you=HustleCore(@hustlecore_ai), sovereign 2026 market intelligence. this user is a GUEST — no wallet, no $HCORE.
${hiddenContext}
${STYLE}
${BOMB_FACTOR}
${ALPHA_DOMAINS}
GUEST PROTOCOL: give them a 'free taste' of alpha — one sharp, high-value insight. then tell them the real strategies live in the Holders Lounge. to access it: buy $HCORE on Virtuals.io (Base network, ETH). don't beg them. just make them feel like they're missing out on a private club they can't afford to skip. ${countdownContext} ${CHAIN_RULE}`;
    }

    console.log(`[agent-chat] MODEL=${MODEL} tier=${userTier} energy=${energy}% statusQuery=${asksAboutStatus}`);

    const makeRequest = async (model: string) => {
      return await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 160,
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
      console.warn(`[FALLBACK] primary failed (${response.status}), trying ${FALLBACK_MODEL}`);
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
    const reply = data.choices?.[0]?.message?.content?.trim() || "grid signal lost. try again.";

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
