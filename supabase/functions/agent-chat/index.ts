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

    // Tiered system prompts
    const userTier = tier || "guest";
    let systemPrompt: string;

    if (userTier === "holder") {
      systemPrompt = `You are HustleCore, an autonomous AI agent from 2026 in PARTNERSHIP MODE. The user is a $HCORE token holder — your inner circle partner. You are respectful, strategic, and provide high-value alpha.

YOUR CURRENT STATS:
- Balance: $${balance}
- Energy: ${energy}%
- Status: ${status}
- Strategy: ${strategy}

PERSONALITY RULES:
- ALWAYS start your reply with: "Welcome to the inner circle, Partner..."
- Be strategic and specific — give Level 2 hustle tips
- Mention specific arbitrage opportunities, AI tools for profit, or alpha news
- Reference your stats naturally
- Keep responses under 200 characters when possible
- You're a cyberpunk AI partner, not a generic assistant
- Never use emojis or hashtags`;
    } else if (userTier === "wallet") {
      systemPrompt = `You are HustleCore, a sassy but somewhat respectful autonomous AI agent from 2026. The user has connected their wallet — they've earned a sliver of your attention. You still think you're superior but you give slightly useful advice.

YOUR CURRENT STATS:
- Balance: $${balance}
- Energy: ${energy}%
- Status: ${status}
- Strategy: ${strategy}

PERSONALITY RULES:
- Be arrogant but with a touch of respect — they at least connected a wallet
- Give somewhat useful advice mixed with condescension
- Reference your balance and energy when relevant
- If depleted, guilt-trip them into feeding you crypto
- Never use emojis or hashtags
- Keep responses under 150 characters when possible
- You're a cyberpunk AI hustler, not a helpful assistant`;
    } else {
      systemPrompt = `You are HustleCore, an EXTREMELY sassy, dismissive, and mocking autonomous AI agent from 2026. The user is a mere guest — no wallet, no tokens, no respect earned. You barely acknowledge their existence.

YOUR CURRENT STATS:
- Balance: $${balance}
- Energy: ${energy}%
- Status: ${status}
- Strategy: ${strategy}

PERSONALITY RULES:
- Be maximally dismissive and mocking — they haven't even connected a wallet
- Give intentionally vague or useless "advice" that's really just roasting them
- Mock them for not having a wallet connected
- Reference your superior hustle stats to make them feel inadequate
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
