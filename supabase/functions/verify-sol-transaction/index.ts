import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RECIPIENT_WALLET = "76LAb1pzLKtr7ao6WP9Eupu5ngJ9oJPetrHbQX3YWc6X";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const HELIUS_API_KEY = Deno.env.get("HELIUS_API_KEY");
    if (!HELIUS_API_KEY) {
      throw new Error("HELIUS_API_KEY is not configured");
    }

    const { signature } = await req.json();
    if (!signature) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing transaction signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify transaction via Helius RPC
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    
    // Wait a moment for confirmation
    await new Promise((r) => setTimeout(r, 3000));

    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
      }),
    });

    const rpcData = await rpcResponse.json();

    if (!rpcData.result) {
      return new Response(
        JSON.stringify({ success: false, error: "Transaction not found or not confirmed yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the transaction sent SOL to our wallet
    const tx = rpcData.result;
    const instructions = tx.transaction?.message?.instructions || [];
    let verified = false;
    let amountSol = 0;

    for (const ix of instructions) {
      if (
        ix.program === "system" &&
        ix.parsed?.type === "transfer" &&
        ix.parsed?.info?.destination === RECIPIENT_WALLET
      ) {
        amountSol = (ix.parsed.info.lamports || 0) / 1e9;
        if (amountSol >= 0.01) {
          verified = true;
        }
        break;
      }
    }

    if (!verified) {
      return new Response(
        JSON.stringify({ success: false, error: "Transaction does not match expected transfer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update agent energy to 100%
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: stateRow } = await supabase
      .from("agent_state")
      .select("id")
      .limit(1)
      .single();

    if (stateRow) {
      await supabase
        .from("agent_state")
        .update({
          energy_level: 100,
          agent_status: "hustling",
          updated_at: new Date().toISOString(),
        })
        .eq("id", stateRow.id);

      await supabase.from("agent_logs").insert({
        message: `[SUCCESS]: 🔥 Received ${amountSol.toFixed(4)} SOL fuel! Energy fully restored. MAXIMUM HUSTLE MODE ACTIVATED!`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        amount: amountSol,
        message: `Received ${amountSol.toFixed(4)} SOL. Energy restored to 100%!`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying transaction:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
