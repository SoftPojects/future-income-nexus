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

    // Reject suspicious patterns (defense-in-depth)
    if (/<script|javascript:|onerror=|onclick=|onload=/i.test(content)) {
      throw new Error("Invalid message content");
    }

    // Validate display_name
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

    const { error } = await sb.from("global_messages").insert({
      wallet_address: wallet_address || null,
      display_name: safeName,
      content: content.trim().slice(0, 500),
      is_holder: !!is_holder,
    });

    if (error) throw error;

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
