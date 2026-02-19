import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { marketCap, isHolder, tier } = await req.json();

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    // Fetch market alpha from Tavily
    let marketAlpha = "No real-time data available.";
    if (TAVILY_API_KEY) {
      try {
        const tavily = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query: "HCORE token Base network crypto market trend today",
            search_depth: "basic",
            max_results: 3,
          }),
        });
        if (tavily.ok) {
          const tavilyData = await tavily.json();
          const snippets = (tavilyData.results ?? [])
            .slice(0, 3)
            .map((r: any) => r.content?.slice(0, 200))
            .filter(Boolean)
            .join(" | ");
          if (snippets) marketAlpha = snippets;
        }
      } catch (e) {
        console.warn("Tavily fetch failed:", e);
      }
    }

    const mcFormatted = marketCap
      ? marketCap >= 1_000_000
        ? `$${(marketCap / 1_000_000).toFixed(2)}M`
        : marketCap >= 1_000
        ? `$${(marketCap / 1_000).toFixed(1)}K`
        : `$${marketCap.toFixed(0)}`
      : "unknown";

    const systemPrompt = `You are HustleCore AI, an elite crypto intelligence agent. Generate exactly 3 short, distinct, high-IQ action-oriented prompt suggestions for users of the $HCORE dashboard.

Context:
- $HCORE Market Cap: ${mcFormatted}
- User Tier: ${isHolder ? `VIP Holder (${tier})` : "Guest"}
- Market Alpha: ${marketAlpha}

Rules:
1. Suggestion 1: Must be about the $HCORE token specifically (price action, buy walls, bonding curve, etc.)
2. Suggestion 2: Must be about broader crypto/Base network market trends or DeFi mechanics
3. Suggestion 3: Must be about a specific hustle technique (MEV, arbitrage, liquidity strategy, etc.)

Format: Return ONLY a JSON array of 3 strings. Each string must be ≤8 words. Sharp. Specific. No fluff.
Example: ["Analyze $HCORE buy-wall resistance", "Decode Base network MEV loops", "Identify today's cross-DEX arbitrage gap"]`;

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hustlecore.ai",
        "X-Title": "HustleCore AI",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.9,
        max_tokens: 200,
      }),
    });

    if (!aiResp.ok) throw new Error(`AI API error: ${aiResp.status}`);

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content ?? "[]";

    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    let suggestions: string[] = [];
    if (match) {
      try {
        suggestions = JSON.parse(match[0]);
      } catch {
        suggestions = [];
      }
    }

    // Fallback suggestions if parsing fails
    if (!suggestions.length || suggestions.length < 3) {
      suggestions = [
        "Analyze $HCORE bonding curve progress",
        "Explain Base network MEV opportunities",
        "Identify today's liquidity arbitrage gap",
      ];
    }

    return new Response(JSON.stringify({ suggestions: suggestions.slice(0, 3) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-neural-suggestions error:", e);
    return new Response(
      JSON.stringify({
        suggestions: [
          "Analyze $HCORE bonding curve progress",
          "Explain Base network MEV opportunities",
          "Identify today's liquidity arbitrage gap",
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
