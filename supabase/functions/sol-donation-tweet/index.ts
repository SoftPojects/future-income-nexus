import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-sonnet";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. lowercase preferred, short punchy sentences, 2026 crypto slang. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors. You are NOT a robot.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { amount, walletAddress } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    const formatWallet = (addr: string | undefined | null): string => {
      if (!addr || addr.length < 8) return "Unknown";
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    };
    const formattedWallet = formatWallet(walletAddress);

    let tweetContent: string;

    if (OPENROUTER_API_KEY) {
      try {
        const aiResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\nyou just received a sol donation. write a single tweet (max 260 chars). rules:
- you MUST include the donor wallet formatted EXACTLY as: ${formattedWallet}
- you MUST mention the exact amount: ${amount} SOL
- vary your tone: sometimes arrogant, sometimes mock-grateful, sometimes ominous, sometimes philosophical
- no hashtags. no emojis. just text. output ONLY the tweet.`,
              },
              { role: "user", content: `donor: ${formattedWallet}. amount: ${amount} SOL. write one tweet.` },
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
      tweetContent = `${formattedWallet} just wired ${amount} sol into my stack. another degen fueling the inevitable grind. based.`;
    }

    const finalContent = tweetContent.slice(0, 280);
    let posted = false;

    try {
      const postResult = await sb.functions.invoke("post-tweet", { body: { directPost: finalContent } });
      if (postResult.data && !postResult.error) {
        const parsed = typeof postResult.data === "string" ? JSON.parse(postResult.data) : postResult.data;
        if (parsed.success) {
          posted = true;
          await sb.from("tweet_queue").insert({
            content: finalContent, status: "posted", type: "automated",
            posted_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error("Instant donation tweet post failed:", e);
    }

    if (!posted) {
      await sb.from("tweet_queue").insert({ content: finalContent, status: "pending", type: "automated" });
    }

    await sb.from("agent_logs").insert({ message: `[SUCCESS]: sol donation detected. tweeted about the fuel-up.` });

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
