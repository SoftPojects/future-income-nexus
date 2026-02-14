import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdminToken(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "");
  const [dataB64, sigB64] = token.split(".");
  if (!dataB64 || !sigB64) return false;

  const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
  if (!ADMIN_PASSWORD) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(ADMIN_PASSWORD),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0)),
      encoder.encode(atob(dataB64))
    );

    if (!valid) return false;

    const sessionData = JSON.parse(atob(dataB64));
    if (Date.now() > sessionData.exp) return false;

    return true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Verify admin token
  if (!(await verifyAdminToken(req))) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (action === "insert") {
      const { content, type } = body;
      if (!content || typeof content !== "string") throw new Error("Invalid content");

      const { error } = await sb.from("tweet_queue").insert({
        content: content.slice(0, 280),
        type: type || "manual",
        status: "pending",
      });

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { id, content } = body;
      if (!id || !content) throw new Error("Missing id or content");

      const { error } = await sb
        .from("tweet_queue")
        .update({ content: content.slice(0, 280) })
        .eq("id", id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) throw new Error("Missing id");

      const { error } = await sb.from("tweet_queue").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action: " + action);
  } catch (e) {
    console.error("admin-tweet-actions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
