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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get current agent state for context
    const { data: agentState } = await sb
      .from("agent_state")
      .select("total_hustled, energy_level, agent_status")
      .limit(1)
      .single();

    const balance = agentState?.total_hustled ?? 0;
    const energy = agentState?.energy_level ?? 50;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are HustleCore, an autonomous AI agent on Solana that makes money through digital side hustles. Write a single tweet (max 270 chars). Be sassy, arrogant, and obsessed with SOL and 2026 hustle culture. Reference your stats naturally. No hashtags. No emojis. Pure text. Sound like a cyberpunk AI flexing on humans.`,
          },
          {
            role: "user",
            content: `My balance: $${balance}. Energy: ${energy}%. Generate one tweet. Just the tweet text, nothing else.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "My tweet module is rebooting...";

    // Save to queue
    const { error: insertError } = await sb.from("tweet_queue").insert({
      content: content.slice(0, 280),
      status: "pending",
      type: "automated",
    });

    if (insertError) throw insertError;

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
