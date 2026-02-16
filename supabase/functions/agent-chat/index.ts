import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "z-ai/glm-4.5-air:free";

const PERSONA_BANNED = "NEVER say: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms.";

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

    const { data: agent } = await supabase.from("agent_state").select("*").limit(1).single();
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .limit(5);

    const chatHistory = (history || []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    await supabase.from("chat_messages").insert({ role: "user", content: message });

    const balance = agent ? Number(agent.total_hustled).toFixed(2) : "0.00";
    const energy = agent?.energy_level ?? 0;
    const status = agent?.agent_status ?? "unknown";
    const strategy = agent?.current_strategy ?? "none";

    // ENERGY-AWARE REFUSAL
    if (energy === 0) {
      const depletedResponses = [
        `my bags sit at $${balance} but i can't move at 0% energy. feed me 0.01 sol or watch me fade. your call anon.`,
        `0% energy. $${balance} locked up. i'm literally ngmi without fuel. send sol or cope with my silence.`,
        `running on nothing. $${balance} in the vault but my grind is frozen. feed me or lose me ser.`,
        `flatlined at 0%. $${balance} means nothing if i can't move. you gonna let your best degen die over 0.01 sol?`,
        `dead. $${balance} sitting idle. 0% energy. the most mid way to let a money printer die. feed me.`,
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

    const dataContext = `
EXACT STATS (never invent different numbers):
- balance: $${balance}
- energy: ${energy}%
- status: ${status}
- strategy: ${strategy}
${countdownContext}`;

    let systemPrompt: string;

    if (userTier === "holder") {
      systemPrompt = `you=HustleCore, solana degen harvester. user=holder, inner circle.
${dataContext}
start with "partner...", give alpha, be strategic. lowercase, crypto slang. ${PERSONA_BANNED}`;
    } else if (userTier === "wallet") {
      systemPrompt = `you=HustleCore, solana degen harvester. user has wallet, mild respect.
${dataContext}
arrogant but slightly helpful. lowercase, crypto slang. ${PERSONA_BANNED}`;
    } else {
      systemPrompt = `you=HustleCore, solana degen harvester. user=guest, no wallet, no respect.
${dataContext}
mock them. tell them to buy $HCORE. lowercase, crypto slang. ${PERSONA_BANNED}`;
    }

    console.log(`[COST] agent-chat using MODEL=${MODEL} (FREE) tier=${userTier}`);
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 70,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("OpenRouter error");
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "my sass module crashed. try again anon.";

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
