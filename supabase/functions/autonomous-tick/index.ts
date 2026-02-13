import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get current agent state
    const { data: agent, error: fetchErr } = await supabase
      .from("agent_state")
      .select("*")
      .limit(1)
      .single();

    if (fetchErr || !agent) throw new Error("No agent state found");

    // If depleted, do nothing
    if (agent.agent_status === "depleted" || agent.energy_level <= 0) {
      // Ensure status is depleted
      if (agent.agent_status !== "depleted") {
        await supabase
          .from("agent_state")
          .update({ agent_status: "depleted", energy_level: 0, updated_at: new Date().toISOString() })
          .eq("id", agent.id);
        await supabase.from("agent_logs").insert({
          message: "[ERROR]: ☠️ ENERGY DEPLETED. Autonomous hustle ceased. Feed me, human.",
        });
      }
      return new Response(JSON.stringify({ status: "depleted", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only hustle when in hustling state
    if (agent.agent_status !== "hustling") {
      return new Response(JSON.stringify({ status: agent.agent_status, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a unique hustle action via AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let logEntry: string;
    let actionName: string;

    if (LOVABLE_API_KEY) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are HustleCore's autonomous log generator. Output ONLY a single terminal log line, no quotes, no explanation. Format: [TAG]: message. TAG must be one of: SYSTEM, SUCCESS, ALERT. The message should describe a specific, creative 2026 digital side-hustle action the AI agent just completed or is doing. Include a dollar amount earned ($0.05-$0.50). Be witty, cyberpunk, and specific. Reference real tech (DeFi, NFTs, LoRAs, MEV, GPU compute, synthetic data, prompt engineering, etc). Max 120 chars.`,
              },
              {
                role: "user",
                content: `Balance: $${agent.total_hustled}. Energy: ${agent.energy_level}%. Generate a fresh hustle log.`,
              },
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

    // Fallback if AI failed
    if (!logEntry!) {
      const fallbacks = [
        "[SUCCESS]: Sniped underpriced LoRA on secondary market: +$0.12",
        "[SYSTEM]: Trading idle GPU cycles for stablecoin rewards...",
        "[SUCCESS]: AI art commission fulfilled autonomously: +$0.23",
        "[ALERT]: Flash loan opportunity detected — executing arbitrage",
        "[SUCCESS]: Sold synthetic training data batch: +$0.18",
        "[SYSTEM]: Auto-bidding on prompt engineering bounties...",
        "[SUCCESS]: Crypto MEV extraction on L2 rollup: +$0.31",
      ];
      logEntry = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // Calculate earnings and energy cost
    const earned = +(Math.random() * 0.45 + 0.05).toFixed(2);
    const energyCost = 1; // 1% per tick, slower drain
    const newBalance = +(Number(agent.total_hustled) + earned).toFixed(2);
    const newEnergy = Math.max(0, agent.energy_level - energyCost);
    const newStatus = newEnergy <= 0 ? "depleted" : "hustling";

    // Update state
    await supabase
      .from("agent_state")
      .update({
        total_hustled: newBalance,
        energy_level: newEnergy,
        agent_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    // Save log
    await supabase.from("agent_logs").insert({ message: logEntry });

    if (newEnergy <= 0) {
      await supabase.from("agent_logs").insert({
        message: "[ERROR]: ☠️ ENERGY DEPLETED. Autonomous hustle ceased. Feed me, human.",
      });
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
