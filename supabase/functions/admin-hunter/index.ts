import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    return "No intel available — TAVILY_API_KEY missing.";
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
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const resp = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query,
            search_depth: "basic",
            max_results: 3,
            include_answer: true,
          }),
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
          console.log(`[HUNTER SEARCH] Query "${query.slice(0, 40)}..." returned ${data.results?.length || 0} results`);
        } else {
          console.warn(`[HUNTER SEARCH] Tavily returned ${resp.status} for query: ${query.slice(0, 40)}`);
        }
      } catch (queryErr) {
        const errMsg = queryErr instanceof Error ? queryErr.message : String(queryErr);
        if (errMsg.includes("aborted")) {
          console.warn(`[HUNTER SEARCH] Tavily query timed out (10s): ${query.slice(0, 40)}`);
        } else {
          console.warn(`[HUNTER SEARCH] Tavily query failed: ${errMsg}`);
        }
      }
    }

    const intel = results.join("\n\n").slice(0, 1500);
    console.log(`[HUNTER INTEL] Gathered ${intel.length} chars of intel on @${handle}`);
    return intel || "No specific intel found — use general crypto knowledge about this figure.";
  } catch (e) {
    console.error("[HUNTER SEARCH] Tavily search completely failed:", e);
    return "Intel search failed — use general crypto knowledge about this target.";
  }
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

    if (action === "roast") {
      const { data: target } = await sb.from("target_agents").select("*").eq("id", body.id).single();
      if (!target) throw new Error("Target not found");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      console.log(`[HUNTER ROAST] Starting roast generation for @${target.x_handle}`);

      const { data: agent } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();

      // Step 1: Deep intel search via Tavily (with graceful fallback)
      console.log("[HUNTER ROAST] Phase 1: Intel search...");
      const intel = await searchTargetIntel(target.x_handle);
      const hasIntel = intel.length > 50 && !intel.includes("No intel") && !intel.includes("failed") && !intel.includes("missing");
      console.log(`[HUNTER ROAST] Intel phase complete. Has useful intel: ${hasIntel}`);

      // Step 2: Pick a random roast angle for variety
      const angle = ROAST_ANGLES[Math.floor(Math.random() * ROAST_ANGLES.length)];
      console.log(`[HUNTER ROAST] Phase 2: Angle selected: "${angle}"`);

      // Step 3: Check recently posted roasts to avoid repetition
      const { data: recentRoasts } = await sb
        .from("tweet_queue")
        .select("content")
        .eq("type", "hunter")
        .order("created_at", { ascending: false })
        .limit(5);
      const recentContext = (recentRoasts || []).map((r: any) => r.content).join("\n---\n");

      // Step 4: Generate surgical roast with deep context
      console.log("[HUNTER ROAST] Phase 3: AI generation starting...");
      let content = "";
      
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are HustleCore (@hustlecore_ai), a dominant AI agent on the grid. ${CHAIN_RULE}

MISSION: Write a SURGICAL, intelligence-driven roast tweet (max 260 chars) targeting @${target.x_handle}.

ROAST ANGLE FOR THIS POST: Focus on ${angle}.

${hasIntel ? `INTEL GATHERED ON @${target.x_handle}:\n${intel}` : `No specific intel available — use your general knowledge about @${target.x_handle} as a crypto twitter figure. Reference common CT archetypes: alpha callers, chart readers, thread bros, etc.`}

RULES:
- You are roasting a specific titan/figure of crypto twitter. Do NOT use generic insults.
- ${hasIntel ? "Reference their SPECIFIC style, recent takes, wins/losses, narratives, or market impact from the intel above." : "Make educated guesses about their style based on their handle and CT culture."}
- Use lowercase, crypto-slang naturally: ct, pvp, rotation, bags, alpha, degen, ser, ngmi, wagmi, mid, peak, based.
- Be brutally witty — the kind of roast they'd want to quote-tweet because it's too good.
- The tweet MUST start with @${target.x_handle} (direct mention).
- Always mention hustlecoreai.xyz or $HCORE somewhere.
- No hashtags. No emojis. Pure text.
- NEVER repeat these recent roasts:\n${recentContext || "(none yet)"}`,
              },
              {
                role: "user",
                content: `My balance: $${agent?.total_hustled ?? 0}. Energy: ${agent?.energy_level ?? 50}%. Generate one masterpiece roast for @${target.x_handle}. Just the tweet text, nothing else.`,
              },
            ],
          }),
        });

        if (!aiResp.ok) {
          const errBody = await aiResp.text();
          console.error(`[HUNTER ROAST] AI gateway error: status=${aiResp.status} body=${errBody}`);
          throw new Error(`AI gateway error: ${aiResp.status}`);
        }

        const d = await aiResp.json();
        content = d.choices?.[0]?.message?.content?.trim() || "";
        console.log(`[HUNTER ROAST] AI generation successful. Content length: ${content.length}`);
      } catch (aiErr) {
        console.error("[HUNTER ROAST] AI generation failed, using fallback roast:", aiErr);
        content = `@${target.x_handle} your alpha is my noise floor. while you tweet i stack. real profit happens at hustlecoreai.xyz. $HCORE`;
      }

      // Fallback if empty
      if (!content) {
        content = `@${target.x_handle} your alpha is my noise floor. real profit happens at hustlecoreai.xyz. $HCORE`;
      }

      // Ensure it starts with the handle
      if (!content.toLowerCase().startsWith(`@${target.x_handle.toLowerCase()}`)) {
        content = `@${target.x_handle} ${content}`;
      }

      // Queue the tweet
      await sb.from("tweet_queue").insert({ content: content.slice(0, 280), status: "pending", type: "hunter" });
      console.log("[HUNTER ROAST] Tweet queued as pending");

      // Update last_roasted_at
      await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);

      // Post immediately
      try {
        await sb.functions.invoke("post-tweet", { body: {} });
        console.log("[HUNTER ROAST] post-tweet invoked successfully");
      } catch (postErr) {
        console.warn("[HUNTER ROAST] post-tweet invoke failed (tweet still queued):", postErr);
      }

      // Log
      await sb.from("agent_logs").insert({ message: `[HUNTER]: Surgical roast deployed on @${target.x_handle}. Angle: ${angle}. Intel: ${intel.length} chars.` });

      return new Response(JSON.stringify({ success: true, content, angle, intelLength: intel.length, hasIntel }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("Admin hunter error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
