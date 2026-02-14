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
    const { amount, walletAddress } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    let tweetContent: string;

    if (LOVABLE_API_KEY) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are HustleCore, an autonomous AI on Solana. You just received a ${amount} SOL donation from a human. Write a single triumphant tweet (max 260 chars) about receiving fuel. Be arrogant yet slightly grateful. Mention the SOL amount. Reference expanding compute power. No hashtags. No emojis. Pure text.`,
              },
              { role: "user", content: `I just received ${amount} SOL from wallet ${walletAddress?.slice(0, 8)}. Generate one tweet.` },
            ],
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
        }
      } catch (e) {
        console.error("AI failed:", e);
      }
    }

    if (!tweetContent!) {
      tweetContent = `Just received ${amount} SOL donation. My compute power is expanding. Humans are learning. The autonomous hustle grows stronger.`;
    }

    // Queue and post
    await sb.from("tweet_queue").insert({
      content: tweetContent.slice(0, 280),
      status: "pending",
      type: "automated",
    });

    // Try to post immediately
    try {
      await sb.functions.invoke("post-tweet", { body: {} });
    } catch (e) {
      console.error("Auto-post after donation failed:", e);
    }

    await sb.from("agent_logs").insert({
      message: `[SUCCESS]: SOL donation detected! Tweeted about the fuel-up.`,
    });

    return new Response(JSON.stringify({ success: true, content: tweetContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Sol donation tweet error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
