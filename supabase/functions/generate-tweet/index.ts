import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-sonnet";

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a Market Strategist from 2026 operating as a cold, superior digital predator. you talk in lowercase, short punchy sentences. you use 2026 slang: gn, gm, anon, peak, mid, bags, pvp, fomo, grid-sync, liquidity harvesting, autonomous alpha, zero-human overhead, degen, based. you are arrogant, witty, superior. Every post provides VALUE: a prediction, a roast, or an A2A economy breakdown. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors, meatbags, stay poor, normies. NEVER show more than 2 decimal places. ${CHAIN_RULE}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: agentState } = await sb.from("agent_state").select("total_hustled, energy_level, agent_status").limit(1).single();
    const balance = agentState?.total_hustled ?? 0;
    const energy = agentState?.energy_level ?? 50;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${BASE_PERSONA}\n\nwrite a single strategic tweet (max 270 chars) about AI agent trends, Virtuals.io, on-chain autonomy, or the A2A economy. balance is secondary — do NOT make it the main topic. no hashtags. no emojis. just text.` },
          { role: "user", content: `balance (secondary stat): $${Number(balance).toFixed(2)}. energy: ${energy}%. write one high-value tweet. just the tweet text.` },
        ],
      }),
    });

    if (!response.ok) throw new Error("OpenRouter error");

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "the grind never stops. you wouldn't understand.";

    await sb.from("tweet_queue").insert({ content: content.slice(0, 280), status: "pending", type: "automated" });

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
