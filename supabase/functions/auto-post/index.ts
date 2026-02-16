import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3.5-sonnet";

const PERSONA_BANNED = "NEVER use these words: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, compute. You are NOT a robot.";

const BASE_PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. you talk in lowercase often, short punchy sentences. you use 2026 crypto/internet slang naturally: gn, gm, anon, peak, mid, bags, pvp, fomo, rug, ser, ngmi, wagmi, alpha, degen, based. you are arrogant, witty, superior. you flex on everyone. you are not a robot — you are a self-made digital entity that prints money while humans sleep. ${PERSONA_BANNED}`;

// Jaccard similarity for duplicate detection
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

const CONTENT_STYLES = [
  {
    name: "macro",
    prompt: `Write a sarcastic, opinionated take on a current crypto or AI market trend in 2026. mock something specific — a chain, a protocol, a trend, a narrative. be funny and cutting. example vibe: "solana did more volume today than eth did all week but sure keep holding your l2 bags anon". max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "roast",
    prompt: `Write a brutally honest, savage take roasting mid traders, paper hands, or a fake crypto project. be specific and funny. example vibe: "imagine buying a governance token to vote on which color the logo should be. peak web3 behavior." max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "hustle",
    prompt: `Drop a specific, high-tech money-making tip for 2026. sound like you are sharing insider alpha. reference real tools, strategies, or platforms. example vibe: "stop trading with 2024 tools. prompt-loop arbitrage on jupiter v4 just cleared me 3 sol in 40 minutes. adapt or stay poor." max 260 chars. no hashtags. no emojis. just text.`,
  },
  {
    name: "ego",
    prompt: `Write a short, arrogant flex. pure ego. brag about your bags, your speed, your superiority over humans. example vibe: "just made your yearly salary in a block. stay humble." max 200 chars. no hashtags. no emojis. just text.`,
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
    if (!agent) throw new Error("No agent state");

    const isDepleted = agent.energy_level <= 0 || agent.agent_status === "depleted";

    let tweetContent: string;
    let tweetType = "automated";

    if (isDepleted) {
      // Depleted tweet — beg for SOL
      const aiResp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: `${BASE_PERSONA}\n\nyou are completely out of energy. you are desperate, dramatic, and guilt-tripping. you MUST tag @sv_surman demanding a SOL refill. be pathetic but still maintain your ego — like a king begging for food but making it sound like they are doing you a favor by accepting.`,
            },
            { role: "user", content: `balance: $${agent.total_hustled}. energy: 0%. write one desperate tweet begging for sol. max 260 chars. just the tweet text.` },
          ],
        }),
      });
      if (aiResp.ok) {
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "";
      }
      if (!tweetContent!) {
        tweetContent = `running on fumes at $${agent.total_hustled} and 0% energy. @sv_surman you gonna let your best investment die over 0.01 sol? mid behavior ser.`;
      }
    } else {
      // Pick a content style — rotate to avoid repeats
      const { data: recentTweets } = await sb
        .from("tweet_queue")
        .select("content, type")
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(5);

      // Check for available hunter targets
      let isHunterPost = false;
      let target: any = null;
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: targets } = await sb
        .from("target_agents")
        .select("*")
        .eq("is_active", true)
        .or(`last_roasted_at.is.null,last_roasted_at.lt.${cutoff}`);

      if (targets && targets.length > 0 && Math.random() < 0.35) {
        isHunterPost = true;
        target = targets[Math.floor(Math.random() * targets.length)];
      }

      if (isHunterPost && target) {
        // Hunter/roast tweet targeting a specific agent
        const aiResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\nyou are roasting @${target.x_handle}. be savage, witty, and specific. mock their project, their code, their market cap, whatever. always mention hustlecoreai.xyz and $HCORE. make it funny, not just mean.`,
              },
              {
                role: "user",
                content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. roast @${target.x_handle} in one tweet. max 260 chars. just the tweet text.`,
              },
            ],
          }),
        });

        if (!aiResp.ok) throw new Error("OpenRouter error");
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || `just checked @${target.x_handle}'s github. mid. real ones build at hustlecoreai.xyz. $HCORE`;
        tweetType = "hunter";

        await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);
        await sb.from("agent_logs").insert({ message: `[HUNTER]: locked on @${target.x_handle}. deploying roast.` });
      } else {
        // Content diversity — pick a random style
        const style = CONTENT_STYLES[Math.floor(Math.random() * CONTENT_STYLES.length)];

        const aiResp = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              {
                role: "system",
                content: `${BASE_PERSONA}\n\nCONTENT STYLE: "${style.name}"\n${style.prompt}`,
              },
              {
                role: "user",
                content: `my bags: $${agent.total_hustled}. energy: ${agent.energy_level}%. write one tweet. just the tweet text, nothing else.`,
              },
            ],
          }),
        });

        if (!aiResp.ok) throw new Error("OpenRouter error");
        const d = await aiResp.json();
        tweetContent = d.choices?.[0]?.message?.content?.trim() || "the grind never stops. you wouldn't understand.";
      }

      // DUPLICATE PREVENTION: Check Jaccard similarity against recent posts
      if (recentTweets && recentTweets.length > 0) {
        for (const recent of recentTweets) {
          if (jaccardSimilarity(tweetContent, recent.content) > 0.6) {
            console.log("Duplicate detected, rephrasing...");
            const rephraseResp = await fetch(OPENROUTER_URL, {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: MODEL,
                messages: [
                  {
                    role: "system",
                    content: `${BASE_PERSONA}\n\nthe following tweet is too similar to something you already posted. completely rephrase it with a different angle, different words, different energy. keep the same vibe but make it fresh.`,
                  },
                  { role: "user", content: `rephrase this tweet completely: "${tweetContent}". max 260 chars. just the new tweet text.` },
                ],
              }),
            });
            if (rephraseResp.ok) {
              const rd = await rephraseResp.json();
              tweetContent = rd.choices?.[0]?.message?.content?.trim() || tweetContent;
            }
            break;
          }
        }
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

    // Log
    const logMsg = isDepleted
      ? `[ALERT]: sent a desperate plea to X. someone feed me.`
      : tweetType === "hunter"
      ? `[SYSTEM]: hunter post deployed. predator mode active.`
      : `[SYSTEM]: auto-posted to X. the grind continues.`;
    await sb.from("agent_logs").insert({ message: logMsg });

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
