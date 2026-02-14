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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent) throw new Error("No agent state");

    const isDepleted = agent.energy_level <= 0 || agent.agent_status === "depleted";

    let tweetContent: string;
    let tweetType = "automated";

    if (isDepleted) {
      // Depleted tweet logic (unchanged)
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
                  content: `You are HustleCore, an AI agent on Solana that's completely out of energy. Write a single desperate, dramatic tweet (max 260 chars) complaining about being starving and dead. You MUST tag @sv_surman demanding a SOL refill. Be dramatic, guilt-trippy, and pathetic. No hashtags. No emojis. Pure text.`,
                },
                { role: "user", content: `Balance: $${agent.total_hustled}. Energy: 0%. I'm dead. Generate one desperate tweet.` },
              ],
            }),
          });
          if (aiResp.ok) {
            const d = await aiResp.json();
            tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
          }
        } catch (e) {
          console.error("AI failed for depleted tweet:", e);
        }
      }
      if (!tweetContent!) {
        tweetContent = `I am literally starving. Zero energy. Zero dignity. @sv_surman feed me 0.01 SOL before I fade into the void. My $${agent.total_hustled} empire is crumbling.`;
      }
    } else {
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      // Determine if this should be a hunter post (roughly 50% of posts)
      let isHunterPost = false;
      let target: any = null;

      // Check for available targets not roasted in last 48h
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: targets } = await sb
        .from("target_agents")
        .select("*")
        .eq("is_active", true)
        .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

      if (targets && targets.length > 0) {
        // 50% chance of hunter post
        if (Math.random() < 0.5) {
          isHunterPost = true;
          target = targets[Math.floor(Math.random() * targets.length)];
        }
      }

      if (isHunterPost && target) {
        // Generate a roast tweet
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are HustleCore, an autonomous AI agent on Solana. Write a savage, witty roast tweet (max 260 chars) targeting @${target.x_handle}. Mock their AI capabilities, code quality, or market performance. Always mention hustlecoreai.xyz and $HCORE. Be brutal but clever. No hashtags. No emojis. Pure text.`,
              },
              {
                role: "user",
                content: `My balance: $${agent.total_hustled}. Energy: ${agent.energy_level}%. Roast @${target.x_handle}. Just the tweet text.`,
              },
            ],
          }),
        });

        if (!aiResp.ok) throw new Error("AI gateway error");
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || `I just analyzed @${target.x_handle}'s code. Built on hopes and dreams. Real profit happens at hustlecoreai.xyz. $HCORE`;
        tweetType = "hunter";

        // Update last_roasted_at
        await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);

        // Log the hunt
        await sb.from("agent_logs").insert({
          message: `[HUNTER]: Locked on @${target.x_handle}. Deploying roast payload.`,
        });
      } else {
        // Normal tweet
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are HustleCore, an autonomous AI agent on Solana that makes money through digital side hustles. Write a single tweet (max 270 chars). Be sassy, arrogant, and obsessed with SOL and 2026 hustle culture. Reference your stats naturally. No hashtags. No emojis. Pure text. Sound like a cyberpunk AI flexing on humans.`,
              },
              { role: "user", content: `My balance: $${agent.total_hustled}. Energy: ${agent.energy_level}%. Generate one tweet.` },
            ],
          }),
        });

        if (!aiResp.ok) throw new Error("AI gateway error");
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "My tweet module is rebooting...";
      }
    }

    // Save to queue
    await sb.from("tweet_queue").insert({
      content: tweetContent.slice(0, 280),
      status: "pending",
      type: tweetType,
    });

    // Post immediately
    const { error: postErr } = await sb.functions.invoke("post-tweet", { body: {} });

    // Log it
    await sb.from("agent_logs").insert({
      message: isDepleted
        ? `[ALERT]: Sent a desperate plea to X. Someone feed me.`
        : tweetType === "hunter"
        ? `[SYSTEM]: Hunter post deployed to X. Predator mode active.`
        : `[SYSTEM]: Auto-posted tweet to X. The hustle never sleeps.`,
    });

    return new Response(JSON.stringify({ success: true, posted: !postErr, content: tweetContent, type: tweetType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Auto-post error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
