import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Retry helper for transient connection errors (Connection reset by peer, os error 104)
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 150): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = e?.message || String(e);
      const isTransient = msg.includes("Connection reset") || msg.includes("os error 104") || msg.includes("client error (Connect)");
      if (!isTransient || attempt === retries) throw e;
      console.warn(`[RETRY] Attempt ${attempt} failed (transient): ${msg}. Retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("withRetry: exhausted (should not reach here)");
}

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

      const { error } = await withRetry(() =>
        sb.from("agent_state").update({
          total_hustled,
          energy_level,
          agent_status,
          current_strategy,
          updated_at: new Date().toISOString(),
        }).eq("id", id)
      );

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "insert_log") {
      const { message } = body;
      if (!message || typeof message !== "string") throw new Error("Invalid message");

      // insert_log is non-critical — silently succeed on transient errors so the UI never 500s
      try {
        const { error } = await withRetry(() =>
          sb.from("agent_logs").insert({ message: message.slice(0, 500) })
        );
        if (error) console.warn("[insert_log] DB error (non-fatal):", error.message);
      } catch (logErr: any) {
        console.warn("[insert_log] Transient failure swallowed:", logErr?.message);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trim_logs") {
      try {
        const { count } = await withRetry(() =>
          sb.from("agent_logs").select("id", { count: "exact", head: true })
        );

        if (count && count > 200) {
          const { data: oldLogs } = await withRetry(() =>
            sb.from("agent_logs").select("id").order("created_at", { ascending: true }).limit(count - 80)
          );

          if (oldLogs && oldLogs.length > 0) {
            await withRetry(() =>
              sb.from("agent_logs").delete().in("id", oldLogs.map((l: any) => l.id))
            );
          }
        }
      } catch (trimErr: any) {
        console.warn("[trim_logs] Non-fatal trim error:", trimErr?.message);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_leaderboard") {
      const { playerBalance } = body;
      if (typeof playerBalance !== "number") throw new Error("Invalid playerBalance");

      await withRetry(() =>
        sb.from("leaderboard").update({ total_hustled: playerBalance }).eq("is_player", true)
      );

      const { data } = await withRetry(() =>
        sb.from("leaderboard").select("*").order("total_hustled", { ascending: false }).limit(10)
      );

      return new Response(JSON.stringify({ success: true, entries: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action: " + action);
  } catch (e: any) {
    const msg = e?.message || (typeof e === "string" ? e : JSON.stringify(e) || "Unknown error");
    console.error("manage-agent error:", { message: msg, details: e?.details || "", hint: e?.hint || "", code: e?.code || "" });
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
