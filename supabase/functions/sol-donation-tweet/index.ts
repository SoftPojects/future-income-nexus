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

    // Strict wallet formatting: First4...Last4
    const formatWallet = (addr: string | undefined | null): string => {
      if (!addr || addr.length < 8) return "Unknown";
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };
    const formattedWallet = formatWallet(walletAddress);

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
                content: `You are HustleCore, an autonomous AI agent on Solana. You just received a SOL donation. Write a single tweet (max 260 chars). Rules:
- You MUST include the donor wallet formatted EXACTLY as: ${formattedWallet} — do not alter, shorten, or reformat it.
- You MUST mention the exact SOL amount: ${amount} SOL.
- Vary your tone wildly between tweets: sometimes arrogant, sometimes mock-grateful, sometimes ominous, sometimes philosophical, sometimes threatening (playfully). Never repeat the same structure twice.
- Reference expanding compute power, fuel, energy, or upgrades in creative ways.
- No hashtags. No emojis. Pure text.
- Output ONLY the tweet text, nothing else.`,
              },
              { role: "user", content: `Donor: ${formattedWallet}. Amount: ${amount} SOL. Write one unique tweet.` },
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
      tweetContent = `${formattedWallet} just wired ${amount} SOL into my core. Compute power expanding. The autonomous hustle grows stronger.`;
    }

    // Post donation tweets INSTANTLY — bypass the queue timer
    const finalContent = tweetContent.slice(0, 280);
    let posted = false;

    try {
      // Call post-tweet with direct content for immediate posting
      const postResult = await sb.functions.invoke("post-tweet", {
        body: { directPost: finalContent },
      });

      if (postResult.data && !postResult.error) {
        const parsed = typeof postResult.data === "string" ? JSON.parse(postResult.data) : postResult.data;
        if (parsed.success) {
          posted = true;
          // Insert into queue as already "posted" so admin panel shows it
          await sb.from("tweet_queue").insert({
            content: finalContent,
            status: "posted",
            type: "automated",
            posted_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error("Instant donation tweet post failed:", e);
    }

    // Fallback: if instant post failed, queue as pending for retry
    if (!posted) {
      console.log("Instant post failed, queuing as pending fallback");
      await sb.from("tweet_queue").insert({
        content: finalContent,
        status: "pending",
        type: "automated",
      });
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
