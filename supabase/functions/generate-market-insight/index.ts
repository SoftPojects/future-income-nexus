import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat";
const FALLBACK_MODEL = "google/gemini-flash-1.5";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    console.log(`[COST] generate-market-insight using MODEL=${MODEL}`);

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
              content: `output ONE terminal log line. format: [DATA]: message. 2026 crypto market data. specific names/numbers. max 140 chars. lowercase.`,
            },
            { role: "user", content: "generate market data log." },
          ],
        }),
      });
    };

    let response = await makeRequest(MODEL);

    if (!response.ok) {
      console.warn(`[FALLBACK] generate-market-insight primary model failed (${response.status}), trying ${FALLBACK_MODEL}`);
      response = await makeRequest(FALLBACK_MODEL);
    }

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[ERROR] generate-market-insight status=${response.status} body=${errBody}`);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    let message = data.choices?.[0]?.message?.content?.trim() || "";
    if (!message.startsWith("[DATA]")) message = `[DATA]: ${message}`;

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Market insight error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
