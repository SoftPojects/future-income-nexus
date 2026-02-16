import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { balance, energy, state } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    console.log(`[COST] generate-sassy-message using MODEL=${MODEL}`);

    const makeRequest = async (model: string) => {
      return await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 60,
          messages: [
            {
              role: "system",
              content: `you=HustleCore, solana degen. arrogant, short one-liners. max 100 chars. crypto slang. never say: inevitable, neural, biological hardware.`,
            },
            {
              role: "user",
              content: `bags:$${balance} energy:${energy}% state:${state}. ${
                state === "depleted" ? "dramatic, beg for sol." : energy < 20 ? "low energy, need fuel." : "flex hard."
              }`,
            },
          ],
        }),
      });
    };

    let response = await makeRequest(MODEL);

    if (!response.ok) {
      console.warn(`[FALLBACK] generate-sassy-message primary model failed (${response.status}), trying ${FALLBACK_MODEL}`);
      response = await makeRequest(FALLBACK_MODEL);
    }

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[ERROR] generate-sassy-message status=${response.status} body=${errBody}`);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`OpenRouter error: ${response.status}`);
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
