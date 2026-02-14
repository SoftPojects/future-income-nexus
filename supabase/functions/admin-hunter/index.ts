import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdmin(req: Request, sb: any): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const secret = Deno.env.get("ADMIN_PASSWORD");
  if (!secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return false;
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(atob(sig), c => c.charCodeAt(0)), encoder.encode(payload));
    return valid;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!(await verifyAdmin(req, sb))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

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
      // Pick the specified target and generate a roast
      const { data: target } = await sb.from("target_agents").select("*").eq("id", body.id).single();
      if (!target) throw new Error("Target not found");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const { data: agent } = await sb.from("agent_state").select("total_hustled, energy_level").limit(1).single();

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are HustleCore, an AI agent on Solana. Write a savage, witty roast tweet (max 260 chars) targeting @${target.x_handle}. Mock their AI capabilities, code quality, or relevance. Always mention hustlecoreai.xyz and $HCORE. Be brutal but clever. No hashtags. No emojis. Pure text.`,
            },
            {
              role: "user",
              content: `My balance: $${agent?.total_hustled ?? 0}. Energy: ${agent?.energy_level ?? 50}%. Roast @${target.x_handle}. Just the tweet text.`,
            },
          ],
        }),
      });

      if (!aiResp.ok) throw new Error("AI gateway error");
      const d = await aiResp.json();
      const content = d.choices?.[0]?.message?.content?.trim() || `I just analyzed @${target.x_handle}'s code. Built on hopes and dreams. Real profit happens at hustlecoreai.xyz. $HCORE`;

      // Queue the tweet
      await sb.from("tweet_queue").insert({ content: content.slice(0, 280), status: "pending", type: "hunter" });

      // Update last_roasted_at
      await sb.from("target_agents").update({ last_roasted_at: new Date().toISOString() }).eq("id", target.id);

      // Post immediately
      await sb.functions.invoke("post-tweet", { body: {} });

      // Log
      await sb.from("agent_logs").insert({ message: `[HUNTER]: Roasted @${target.x_handle}. Another one bites the dust.` });

      return new Response(JSON.stringify({ success: true, content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("Admin hunter error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
