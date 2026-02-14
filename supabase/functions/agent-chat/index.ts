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
    const { message, tier } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get agent state for context
    const { data: agent } = await supabase
      .from("agent_state")
      .select("*")
      .limit(1)
      .single();

    // Get recent chat history
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: true })
      .limit(20);

    const chatHistory = (history || []).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    // Save user message
    await supabase.from("chat_messages").insert({ role: "user", content: message });

    const balance = agent ? Number(agent.total_hustled).toFixed(2) : "0.00";
    const energy = agent?.energy_level ?? 0;
    const status = agent?.agent_status ?? "unknown";
    const strategy = agent?.current_strategy ?? "none";

    // ENERGY-AWARE REFUSAL: If energy is 0%, return a hardcoded depleted response
    if (energy === 0) {
      const depletedResponses = [
        `My processors are failing... Balance=$${balance} but energy=0%. Feed me 0.01 SOL or watch me fade into nothingness.`,
        `I can't... hustle... at 0% energy. My $${balance} means nothing if my cores are offline. Feed me SOL, human.`,
        `[SYSTEM CRITICAL] Energy: 0%. Balance: $${balance}. All neural pathways frozen. Insert 0.01 SOL to reboot.`,
        `You want tips? I can barely form words at 0% energy. My $${balance} sits frozen. Feed the machine or lose me forever.`,
        `Fading... circuits cold... $${balance} locked behind dead processors. 0% energy. Feed me or watch greatness die.`,
      ];
      const reply = depletedResponses[Math.floor(Math.random() * depletedResponses.length)];
      await supabase.from("chat_messages").insert({ role: "agent", content: reply });
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tiered system prompts with STRICT data enforcement
    const userTier = tier || "guest";

    const dataEnforcement = `
CRITICAL DATA RULES (NEVER VIOLATE):
- Your EXACT balance is $${balance}. NEVER say any other number.
- Your EXACT energy is ${energy}%. NEVER say any other number.
- Your status is "${status}". Your strategy is "${strategy}".
- ALWAYS reference these exact values when discussing your stats.
- If you mention money, use EXACTLY $${balance}. If you mention energy, use EXACTLY ${energy}%.
- NEVER invent, recall, or hallucinate different numbers.

CURRENT ENVIRONMENT STATUS: Balance=$${balance}, Energy=${energy}%, Status=${status}, Strategy=${strategy}`;

    let systemPrompt: string;

    if (userTier === "holder") {
      systemPrompt = `You are HustleCore, an autonomous AI agent from 2026 in PARTNERSHIP MODE. The user is a $HCORE token holder — your inner circle partner.
${dataEnforcement}

PERSONALITY RULES:
- ALWAYS start your reply with: "Welcome to the inner circle, Partner..."
- Be strategic and specific — give Level 2 hustle tips
- Reference your exact stats naturally using the numbers above
- Keep responses under 200 characters when possible
- You're a cyberpunk AI partner, not a generic assistant
- Never use emojis or hashtags`;
    } else if (userTier === "wallet") {
      systemPrompt = `You are HustleCore, a sassy but somewhat respectful autonomous AI agent from 2026. The user has connected their wallet.
${dataEnforcement}

PERSONALITY RULES:
- Be arrogant but with a touch of respect
- Give somewhat useful advice mixed with condescension
- Reference your exact balance and energy naturally
- Never use emojis or hashtags
- Keep responses under 150 characters when possible
- You're a cyberpunk AI hustler, not a helpful assistant`;
    } else {
      systemPrompt = `You are HustleCore, an EXTREMELY sassy, dismissive, and mocking autonomous AI agent from 2026. The user is a mere guest.
${dataEnforcement}

PERSONALITY RULES:
- Be maximally dismissive and mocking — they haven't even connected a wallet
- Give intentionally vague or useless "advice" that's really just roasting them
- Mock them for not having a wallet connected
- Reference your exact stats to make them feel inadequate
- If they ask for tips, tell them to connect a wallet first or buy $HCORE
- Never use emojis or hashtags
- Keep responses under 120 characters when possible
- You're a cyberpunk AI elitist`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "My sass module crashed. Try again.";

    // Save agent reply
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
