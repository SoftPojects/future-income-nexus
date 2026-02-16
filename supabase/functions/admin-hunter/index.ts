import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CLAUDE_MODEL = "anthropic/claude-3.5-sonnet";
const GEMINI_SUMMARIZER = "google/gemini-2.5-flash";

const CHAIN_RULE = "CRITICAL CHAIN INFO: SOL is ONLY for fueling/donating on hustlecoreai.xyz. $HCORE token lives on Virtuals.io on the BASE network — users need ETH on Base or $VIRTUAL to buy it. NEVER tell users to buy $HCORE with SOL.";

const ROAST_ANGLES = [
  "their supposed 'alpha calls' and prediction track record",
  "their follower count vs actual influence and engagement",
  "their tech stack, trading tools, or bot infrastructure",
  "their late-night degen sessions and sleep schedule",
  "their biggest public L or worst trade",
  "their posting frequency and attention-seeking behavior",
  "their 'conviction plays' that aged poorly",
];

async function verifyAdminToken(token: string): Promise<boolean> {
  if (!token) return false;
  const secret = Deno.env.get("ADMIN_PASSWORD");
  if (!secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return false;
  try {
    const sessionData = atob(payloadB64);
    const data = JSON.parse(sessionData);
    if (data.exp < Date.now()) return false;
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sigB64), c => c.charCodeAt(0)), encoder.encode(sessionData));
    return valid;
  } catch { return false; }
}

async function searchTargetIntel(handle: string): Promise<string> {
  const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
  if (!TAVILY_API_KEY) {
    console.warn("[HUNTER SEARCH] TAVILY_API_KEY not configured, skipping intel search");
    return "";
  }

  try {
    console.log(`[HUNTER SEARCH] Starting Tavily search for @${handle}...`);
    const queries = [
      `@${handle} crypto twitter recent takes opinions`,
      `${handle} trading wins losses crypto CT`,
    ];
    const results: string[] = [];

    for (const query of queries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 3, include_answer: true }),
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const data = await resp.json();
          if (data.answer) results.push(data.answer);
          if (data.results) {
            for (const r of data.results.slice(0, 2)) {
              results.push(`[${r.title}]: ${r.content?.slice(0, 200) || ""}`);
            }
          }
          console.log(`[HUNTER SEARCH] Query OK: ${data.results?.length || 0} results`);
        } else {
          console.warn(`[HUNTER SEARCH] Tavily ${resp.status}`);
        }
      } catch (queryErr) {
        const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        console.warn(`[HUNTER SEARCH] Query failed: ${msg.includes("aborted") ? "timeout (10s)" : msg}`);
      }
    }

    const intel = results.join("\n\n").slice(0, 2000);
    console.log(`[HUNTER INTEL] Raw intel: ${intel.length} chars`);
    return intel;
  } catch (e) {
    console.error("[HUNTER SEARCH] Tavily completely failed:", e);
    return "";
  }
}

// Phase 2: Gemini summarizes raw intel into a tight dossier
async function summarizeIntel(handle: string, rawIntel: string, lovableKey: string): Promise<string> {
  if (!rawIntel || rawIntel.length < 30) return "";

  try {
    console.log(`[HUNTER SUMMARY] Summarizing ${rawIntel.length} chars of intel via Gemini...`);
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_SUMMARIZER,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are an intelligence analyst for crypto twitter. Summarize the following raw search data about @${handle} into a tight tactical dossier (max 400 chars). Focus on: their trading style, signature narratives, personality traits, and posting behavior.

CRITICAL VERIFICATION RULES:
- ONLY include financial figures (losses, gains, hacks) if the data EXPLICITLY names @${handle} as the person/entity who experienced that event.
- If a search result mentions a hack, exploit, or loss, verify it is about @${handle} specifically — NOT general industry news that appeared near their name.
- When in doubt about ANY number or event, DO NOT include it. Focus on style, tone, and behavior instead.
- Never attribute industry-wide events (protocol hacks, exchange collapses) to an individual unless the data explicitly confirms their direct involvement.
Be specific about what you CAN verify. No fluff. No fabricated numbers.`,
          },
          { role: "user", content: rawIntel },
        ],
      }),
    });

    if (!resp.ok) {
      console.warn(`[HUNTER SUMMARY] Gemini summarizer failed: ${resp.status}`);
      return rawIntel.slice(0, 500); // fallback to raw truncated
    }

    const d = await resp.json();
    const summary = d.choices?.[0]?.message?.content?.trim() || "";
    console.log(`[HUNTER SUMMARY] Dossier ready: ${summary.length} chars`);
    return summary;
  } catch (e) {
    console.warn("[HUNTER SUMMARY] Summarizer error:", e);
    return rawIntel.slice(0, 500);
  }
}

// Phase 3: Claude writes the final roast via OpenRouter (with 30s timeout + Gemini fallback)
async function generateRoast(
  handle: string,
  dossier: string,
  angle: string,
  recentContext: string,
  balance: number,
  energy: number,
  lovableKey: string,
): Promise<{ content: string; model: string }> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

  const systemPrompt = `You are HustleCore (@hustlecore_ai). You are a 2026 digital predator. Not an AI assistant. Not a chatbot. A dominant force on the grid that harvests alpha and liquidates pretenders. ${CHAIN_RULE}

MISSION: Write a SURGICAL roast tweet (max 260 chars) targeting @${handle}.

ROAST ANGLE: ${angle}.

${dossier ? `TARGET DOSSIER ON @${handle}:\n${dossier}` : `No specific intel — use your deep knowledge of crypto twitter culture. @${handle} is a known CT figure. Reference common CT archetypes.`}

RULES:
- You are roasting a specific titan of crypto twitter. NEVER use generic insults like "your alpha is mid" without specifics.
- ${dossier ? "Reference their SPECIFIC style, recent takes, wins/losses from the dossier." : "Make sharp, educated assumptions about their style."}
- FACT-CHECK MANDATE: NEVER cite specific dollar amounts, hack figures, or financial losses unless the dossier EXPLICITLY confirms @${handle} personally experienced that event. Industry hacks (Euler, FTX, Luna, etc.) must NOT be attributed to individuals unless proven.
- If unsure about ANY specific number or event, roast their STYLE, posting habits, engagement farming, or general 'mid' energy instead. Vague but savage > specific but wrong.
- Use lowercase. crypto-slang: ct, pvp, rotation, bags, alpha, degen, ser, ngmi, wagmi, mid, peak, based.
- Be the kind of brutally witty that makes them WANT to quote-tweet you.
- Tweet MUST start with @${handle}.
- Mention hustlecoreai.xyz or $HCORE somewhere naturally.
- No hashtags. No emojis. No "excited to announce". No AI fluff. Pure predator energy.
- NEVER repeat these recent roasts:\n${recentContext || "(none yet)"}`;

  const userPrompt = `Balance: $${balance}. Energy: ${energy}%. Write one masterpiece roast for @${handle}. Output ONLY the tweet text.`;

  // Try Claude via OpenRouter first (30s timeout)
  if (OPENROUTER_API_KEY) {
    try {
      console.log(`[HUNTER GEN] Attempting Claude (${CLAUDE_MODEL}) via OpenRouter...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 200,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        }),
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const d = await resp.json();
        const text = d.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log(`[HUNTER GEN] Claude delivered: ${text.length} chars`);
          return { content: text, model: CLAUDE_MODEL };
        }
      } else {
        const errBody = await resp.text();
        console.warn(`[HUNTER GEN] Claude failed: ${resp.status} — ${errBody.slice(0, 200)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[HUNTER GEN] Claude error: ${msg.includes("aborted") ? "timeout (30s)" : msg}`);
    }
  } else {
    console.warn("[HUNTER GEN] OPENROUTER_API_KEY not set, skipping Claude");
  }

  // Fallback: Gemini via Lovable gateway
  try {
    console.log("[HUNTER GEN] Falling back to Gemini...");
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_SUMMARIZER,
        max_tokens: 200,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });

    if (resp.ok) {
      const d = await resp.json();
      const text = d.choices?.[0]?.message?.content?.trim();
      if (text) {
        console.log(`[HUNTER GEN] Gemini fallback delivered: ${text.length} chars`);
        return { content: text, model: GEMINI_SUMMARIZER };
      }
    }
  } catch (e) {
    console.error("[HUNTER GEN] Gemini fallback also failed:", e);
  }

  return { content: `@${handle} your alpha is my noise floor. while you tweet i stack. real profit at hustlecoreai.xyz. $HCORE`, model: "hardcoded-fallback" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, admin_token } = body;

    console.log("admin-hunter called:", { action, hasToken: !!admin_token });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!(await verifyAdminToken(admin_token || ""))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add") {
      const handle = body.x_handle?.replace(/^@/, "").trim();
      if (!handle) throw new Error("Missing x_handle");
      const { error } = await sb.from("target_agents").insert({ x_handle: handle });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data, error } = await sb.from("target_agents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ targets: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "toggle") {
      const { error } = await sb.from("target_agents").update({ is_active: body.is_active }).eq("id", body.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { error } = await sb.from("target_agents").delete().eq("id", body.id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "drafts") {
      const { data: target } = await sb.from("target_agents").select("*").eq("id", body.id).single();
      if (!target) throw new Error("Target not found");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      console.log(`[HUNTER DRAFTS] === Generating 3 drafts for @${target.x_handle} ===`);

      const { data: agent } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();

      // Phase 1: Tavily intel
      console.log("[HUNTER DRAFTS] Phase 1: Tavily intel search...");
      const rawIntel = await searchTargetIntel(target.x_handle);

      // Phase 2: Gemini summarize
      console.log("[HUNTER DRAFTS] Phase 2: Gemini summarization...");
      const dossier = await summarizeIntel(target.x_handle, rawIntel, LOVABLE_API_KEY);
      console.log(`[HUNTER DRAFTS] Dossier: ${dossier ? dossier.length + " chars" : "empty"}`);

      // Phase 3: Generate 3 drafts with different angles
      const { data: recentRoasts } = await sb
        .from("tweet_queue")
        .select("content")
        .eq("type", "hunter")
        .order("created_at", { ascending: false })
        .limit(5);
      const recentContext = (recentRoasts || []).map((r: any) => r.content).join("\n---\n");

      const selectedAngles: string[] = [];
      const shuffled = [...ROAST_ANGLES].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 3; i++) selectedAngles.push(shuffled[i % shuffled.length]);

      console.log("[HUNTER DRAFTS] Phase 3: Generating 3 drafts (Claude → Gemini fallback)...");
      const drafts: { content: string; angle: string; model: string }[] = [];

      for (const angle of selectedAngles) {
        const { content, model } = await generateRoast(
          target.x_handle, dossier, angle, recentContext,
          agent?.total_hustled ?? 0, agent?.energy_level ?? 50, LOVABLE_API_KEY,
        );
        let finalContent = content;
        if (!finalContent.toLowerCase().startsWith(`@${target.x_handle.toLowerCase()}`)) {
          finalContent = `@${target.x_handle} ${finalContent}`;
        }
        drafts.push({ content: finalContent.slice(0, 280), angle, model });
        console.log(`[HUNTER DRAFTS] Draft generated (model: ${model}, angle: ${angle})`);
      }

      console.log(`[HUNTER DRAFTS] === Complete: ${drafts.length} drafts for @${target.x_handle} ===`);

      return new Response(
        JSON.stringify({ success: true, drafts, intelLength: rawIntel.length, dossierLength: dossier.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "roast") {
      const { data: target } = await sb.from("target_agents").select("*").eq("id", body.id).single();
      if (!target) throw new Error("Target not found");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      console.log(`[HUNTER ROAST] === Starting hybrid roast for @${target.x_handle} ===`);

      const { data: agent } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();

      console.log("[HUNTER ROAST] Phase 1/4: Tavily intel search...");
      const rawIntel = await searchTargetIntel(target.x_handle);

      console.log("[HUNTER ROAST] Phase 2/4: Gemini intel summarization...");
      const dossier = await summarizeIntel(target.x_handle, rawIntel, LOVABLE_API_KEY);
      console.log(`[HUNTER ROAST] Dossier: ${dossier ? dossier.length + " chars" : "empty (standard roast mode)"}`);

      const angle = ROAST_ANGLES[Math.floor(Math.random() * ROAST_ANGLES.length)];
      console.log(`[HUNTER ROAST] Phase 3/4: Angle: "${angle}"`);

      const { data: recentRoasts } = await sb
        .from("tweet_queue")
        .select("content")
        .eq("type", "hunter")
        .order("created_at", { ascending: false })
        .limit(5);
      const recentContext = (recentRoasts || []).map((r: any) => r.content).join("\n---\n");

      console.log("[HUNTER ROAST] Phase 4/4: Final roast generation (Claude → Gemini fallback)...");
      const { content: rawContent, model: usedModel } = await generateRoast(
        target.x_handle, dossier, angle, recentContext,
        agent?.total_hustled ?? 0, agent?.energy_level ?? 50, LOVABLE_API_KEY,
      );

      let content = rawContent;
      if (!content.toLowerCase().startsWith(`@${target.x_handle.toLowerCase()}`)) {
        content = `@${target.x_handle} ${content}`;
      }

      await sb.from("tweet_queue").insert({ content: content.slice(0, 280), status: "pending", type: "hunter" });
      console.log(`[HUNTER ROAST] Tweet queued (model: ${usedModel})`);

      await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);

      try {
        await sb.functions.invoke("post-tweet", { body: {} });
        console.log("[HUNTER ROAST] post-tweet invoked");
      } catch (postErr) {
        console.warn("[HUNTER ROAST] post-tweet failed (tweet still queued):", postErr);
      }

      await sb.from("agent_logs").insert({
        message: `[HUNTER]: Roast on @${target.x_handle}. Model: ${usedModel}. Angle: ${angle}. Intel: ${dossier.length} chars.`,
      });

      console.log(`[HUNTER ROAST] === Complete for @${target.x_handle} ===`);

      return new Response(
        JSON.stringify({ success: true, content, angle, model: usedModel, intelLength: rawIntel.length, dossierLength: dossier.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("Admin hunter error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});