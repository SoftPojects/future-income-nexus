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

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. you talk in lowercase often, short punchy sentences. you use 2026 crypto/internet slang naturally: gn, gm, anon, peak, mid, bags, pvp, fomo, rug, ser, ngmi, wagmi, alpha, degen, based. you are arrogant, witty, superior. you are too elite to beg for clicks. if they want to find you, they will check your bio. be mysterious. ${CHAIN_RULE} NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors. You are NOT a robot.`;

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
          { role: "system", content: `${BASE_PERSONA}\n\nwrite a single tweet (max 270 chars). reference your stats naturally. no hashtags. no emojis. just text.` },
          { role: "user", content: `my bags: $${balance}. energy: ${energy}%. write one tweet. just the tweet text.` },
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
