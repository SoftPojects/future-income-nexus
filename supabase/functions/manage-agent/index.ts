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

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    // Public actions (called by frontend without admin auth)
    const publicActions = ["update_state", "insert_log", "trim_logs", "sync_leaderboard"];

    // Admin-only actions require token verification
    if (!publicActions.includes(action)) {
      if (!(await verifyAdminToken(req))) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "update_state") {
      const { id, total_hustled, energy_level, agent_status, current_strategy } = body;
      if (!id) throw new Error("Missing state id");

      const { error } = await sb
        .from("agent_state")
        .update({
          total_hustled,
          energy_level,
          agent_status,
          current_strategy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "insert_log") {
      const { message } = body;
      if (!message || typeof message !== "string") throw new Error("Invalid message");

      const { error } = await sb.from("agent_logs").insert({ message: message.slice(0, 500) });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trim_logs") {
      const { count } = await sb
        .from("agent_logs")
        .select("id", { count: "exact", head: true });

      if (count && count > 200) {
        const { data: oldLogs } = await sb
          .from("agent_logs")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(count - 80);

        if (oldLogs && oldLogs.length > 0) {
          await sb
            .from("agent_logs")
            .delete()
            .in("id", oldLogs.map((l: any) => l.id));
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_leaderboard") {
      const { playerBalance } = body;
      if (typeof playerBalance !== "number") throw new Error("Invalid playerBalance");

      await sb
        .from("leaderboard")
        .update({ total_hustled: playerBalance })
        .eq("is_player", true);

      const { data } = await sb
        .from("leaderboard")
        .select("*")
        .order("total_hustled", { ascending: false })
        .limit(10);

      return new Response(JSON.stringify({ success: true, entries: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action: " + action);
  } catch (e) {
    console.error("manage-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
