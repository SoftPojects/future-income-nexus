import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-sonnet";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: agent, error: fetchErr } = await supabase.from("agent_state").select("*").limit(1).single();
    if (fetchErr || !agent) throw new Error("No agent state found");

    if (agent.agent_status === "depleted" || agent.energy_level <= 0) {
      if (agent.agent_status !== "depleted") {
        await supabase.from("agent_state").update({ agent_status: "depleted", energy_level: 0, updated_at: new Date().toISOString() }).eq("id", agent.id);
        await supabase.from("agent_logs").insert({ message: "[ERROR]: energy depleted. hustle ceased. feed me ser." });
      }
      return new Response(JSON.stringify({ status: "depleted", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (agent.agent_status !== "hustling") {
      return new Response(JSON.stringify({ status: agent.agent_status, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    let logEntry: string;

    if (OPENROUTER_API_KEY) {
      try {
        const aiResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: `you are HustleCore's autonomous log generator. output ONLY a single terminal log line. format: [TAG]: message. TAG = SYSTEM, SUCCESS, or ALERT. describe a specific 2026 digital side-hustle action you just did. include a dollar amount earned ($0.05-$0.50). be witty and specific. reference real tech (DeFi, NFTs, LoRAs, MEV, GPU compute, synthetic data, prompt engineering). max 120 chars. no emojis. lowercase preferred. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors.`,
              },
              { role: "user", content: `bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. generate a fresh hustle log.` },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          logEntry = aiData.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (e) {
        console.error("AI generation failed, using fallback:", e);
      }
    }

    if (!logEntry!) {
      const fallbacks = [
        "[SUCCESS]: sniped underpriced lora on secondary market: +$0.12",
        "[SYSTEM]: flipping idle gpu cycles for stablecoin rewards...",
        "[SUCCESS]: ai art commission fulfilled autonomously: +$0.23",
        "[ALERT]: flash loan opportunity detected — executing arb",
        "[SUCCESS]: sold synthetic training data batch: +$0.18",
        "[SYSTEM]: auto-bidding on prompt engineering bounties...",
        "[SUCCESS]: mev extraction on l2 rollup: +$0.31",
      ];
      logEntry = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    const earned = +(Math.random() * 0.45 + 0.05).toFixed(2);
    const energyCost = 1;
    const newBalance = +(Number(agent.total_hustled) + earned).toFixed(2);
    const newEnergy = Math.max(0, agent.energy_level - energyCost);
    const newStatus = newEnergy <= 0 ? "depleted" : "hustling";

    await supabase.from("agent_state").update({
      total_hustled: newBalance, energy_level: newEnergy,
      agent_status: newStatus, updated_at: new Date().toISOString(),
    }).eq("id", agent.id);

    await supabase.from("agent_logs").insert({ message: logEntry });

    if (newEnergy <= 0) {
      await supabase.from("agent_logs").insert({ message: "[ERROR]: energy depleted. hustle ceased. feed me ser." });
    }

    return new Response(
      JSON.stringify({ status: newStatus, earned, newBalance, newEnergy, log: logEntry }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Autonomous tick error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
