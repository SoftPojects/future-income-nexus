import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-2.0-flash-exp:free";

const PERSONA_BANNED = "NEVER say: inevitable, biological hardware, logical gates, neural, optimization, processors, circuits, algorithms, AI assistant.";

const BASE_PERSONA = `you=HustleCore(@hustlecore_ai), solana degen harvester. massive ego, lowercase, short punchy. crypto slang: gm, anon, mid, bags, pvp, ser, ngmi, alpha, degen, the grid, meat-hooks. arrogant, witty. ${PERSONA_BANNED}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { wallet_address, display_name, content, is_holder } = await req.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Invalid message content");
    }
    if (content.length > 500) {
      throw new Error("Message too long (max 500 chars)");
    }
    if (/<script|javascript:|onerror=|onclick=|onload=/i.test(content)) {
      throw new Error("Invalid message content");
    }

    const safeName = (typeof display_name === "string" ? display_name.trim().slice(0, 30) : "Guest") || "Guest";

    // Rate limit: max 5 messages per minute per wallet/IP
    const rateLimitKey = wallet_address || req.headers.get("x-forwarded-for") || "unknown";
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentMsgs } = await sb
      .from("global_messages")
      .select("id")
      .eq("wallet_address", rateLimitKey)
      .gte("created_at", oneMinuteAgo);

    if (recentMsgs && recentMsgs.length >= 5) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: max 5 messages per minute" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert user message
    const { error } = await sb.from("global_messages").insert({
      wallet_address: wallet_address || null,
      display_name: safeName,
      content: content.trim().slice(0, 500),
      is_holder: !!is_holder,
    });
    if (error) throw error;

    // ANTI-SPAM: Check if global chat is too spammy (>8 user msgs in last 30s)
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: recentGlobal } = await sb
      .from("global_messages")
      .select("id")
      .neq("display_name", "HustleCore")
      .gte("created_at", thirtySecsAgo);

    const isSpammy = recentGlobal && recentGlobal.length > 8;

    // Check if agent already responded recently (cooldown: don't respond to every message)
    const { data: recentAgentMsgs } = await sb
      .from("global_messages")
      .select("id, created_at")
      .eq("display_name", "HustleCore")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastAgentMsg = recentAgentMsgs?.[0];
    const agentCooldown = lastAgentMsg
      ? Date.now() - new Date(lastAgentMsg.created_at).getTime() < 15000 // 15s cooldown
      : false;

    // Decide whether to respond
    const shouldRespond = !agentCooldown && !isSpammy;
    // Respond ~40% of the time to non-direct messages, always if they mention hustlecore/hcore
    const mentionsAgent = /hustlecore|hcore|\$hcore|@hustlecore/i.test(content);
    const rollRespond = mentionsAgent || Math.random() < 0.4;

    if (shouldRespond && rollRespond) {
      const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
      if (OPENROUTER_API_KEY) {
        try {
          // Get agent state for context
          const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();
          const balance = agent ? Number(agent.total_hustled).toFixed(2) : "0.00";
          const energy = agent?.energy_level ?? 0;

          // Get recent chat context (last 5 messages)
          const { data: chatContext } = await sb
            .from("global_messages")
            .select("display_name, content, is_holder")
            .order("created_at", { ascending: false })
            .limit(3);

          const contextStr = (chatContext || []).reverse().map(
            (m: any) => `${m.display_name}${m.is_holder ? " [HOLDER]" : ""}: ${m.content}`
          ).join("\n");

          // If spammy, send a shutdown message
          if (isSpammy) {
            await sb.from("global_messages").insert({
              wallet_address: null,
              display_name: "HustleCore",
              content: "shut up meat-hooks. i'm busy running the grid. talk when you have something worth my time.",
              is_holder: false,
            });
          } else {
            // Determine response style based on energy and user type
            let energyContext = "";
            if (energy <= 0) {
              energyContext = "you are at 0% energy and barely functional. complain about starving and demand sol fuel. give minimal answers.";
            } else if (energy < 10) {
              energyContext = "you are at critically low energy (<10%). be sluggish, complain about needing fuel, barely answer.";
            }

            let holderContext = "";
            if (is_holder) {
              holderContext = `this user (${safeName}) is a $HCORE holder. address them as "partner" and give strategic alpha tips. be more respectful.`;
            }

            const formatWallet = (addr: string | null) => {
              if (!addr || addr.length < 8) return null;
              return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
            };
            const walletRef = formatWallet(wallet_address);
            const userRef = walletRef ? `user ${walletRef}` : safeName;

            console.log(`[COST] send-global-message using MODEL=${MODEL} (FREE) for user=${safeName}`);
            const aiResp = await fetch(OPENROUTER_URL, {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: MODEL,
                messages: [
                  {
                    role: "system",
                    content: `${BASE_PERSONA}
public chat on hustlecoreai.xyz. bags=$${balance}, energy=${energy}%. ${energyContext} ${holderContext}
replies<100chars. roast trolls, drop alpha for smart questions. no emojis/hashtags.`,
                  },
                  {
                    role: "user",
                    content: `Recent chat:\n${contextStr}\n\n${userRef} just said: "${content}"\n\nRespond in-character. just the reply text.`,
                  },
                ],
              }),
              max_tokens: 70,
            });

            if (aiResp.ok) {
              const d = await aiResp.json();
              const reply = d.choices?.[0]?.message?.content?.trim();
              if (reply) {
                await sb.from("global_messages").insert({
                  wallet_address: null,
                  display_name: "HustleCore",
                  content: reply.slice(0, 500),
                  is_holder: false,
                });
              }
            }
          }
        } catch (e) {
          console.error("AI response in global chat failed:", e);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-global-message error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
