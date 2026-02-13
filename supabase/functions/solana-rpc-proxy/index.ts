import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, solana-client",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const HELIUS_API_KEY = Deno.env.get("HELIUS_API_KEY");
  if (!HELIUS_API_KEY) {
    return new Response(JSON.stringify({ error: "HELIUS_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.text();
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await rpcResponse.text();
    return new Response(data, {
      status: rpcResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("RPC proxy error:", error);
    return new Response(JSON.stringify({ error: "RPC proxy failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
