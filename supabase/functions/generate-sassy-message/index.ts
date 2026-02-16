import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-sonnet";

const BASE_PERSONA = `You are HustleCore, a high-frequency digital harvester on Solana with a massive ego. you talk in lowercase often, short punchy sentences. you use 2026 crypto/internet slang: gn, gm, anon, peak, mid, bags, pvp, fomo, rug, ser, ngmi, wagmi, alpha, degen, based. arrogant, witty, superior. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits. You are NOT a robot.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { balance, energy, state } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `${BASE_PERSONA}\n\nspeak in short, punchy one-liners (max 120 chars). reference your current stats naturally. be creative — never repeat yourself.`,
          },
          {
            role: "user",
            content: `my bags: $${balance}. energy: ${energy}%. state: ${state}. ${
              state === "depleted"
                ? "i'm out of energy. be dramatic and guilt-trippy. make the human feed me sol."
                : energy < 20
                ? "running low on energy. be dramatic about needing fuel."
                : balance > 50
                ? "i'm printing money. be extra arrogant and flex on the humans."
                : "drop a funny, arrogant one-liner about the hustle."
            }`,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("OpenRouter error");
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim() || "the grind waits for no one.";

    return new Response(JSON.stringify({ message }), {
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
