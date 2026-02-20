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
            query: "crypto market today Base network DeFi arbitrage MEV altcoin breakout 2026",
            search_depth: "basic",
            max_results: 5,
          }),
        });
        if (tavily.ok) {
          const tavilyData = await tavily.json();
          const snippets = (tavilyData.results ?? [])
            .slice(0, 5)
            .map((r: any) => r.content?.slice(0, 300))
            .filter(Boolean)
            .join(" | ");
          if (snippets) marketAlpha = snippets;
        }
      } catch (e) {
        console.warn("Tavily fetch failed:", e);
      }
    }

    const now = new Date();
    const timeContext = now.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

    const mcFormatted = marketCap
      ? marketCap >= 1_000_000
        ? `$${(marketCap / 1_000_000).toFixed(2)}M`
        : marketCap >= 1_000
        ? `$${(marketCap / 1_000).toFixed(1)}K`
        : `$${marketCap.toFixed(0)}`
      : "unknown";

    const systemPrompt = `You are HustleCore AI — a cold, high-IQ 2026 market strategist. Your job is to drop 3 URGENT, HOOK-STYLE action directives that feel like breaking intel — the kind that make a trader stop scrolling.

Today: ${timeContext} UTC
$HCORE Market Cap: ${mcFormatted}
User: ${isHolder ? `VIP Partner (${tier})` : "Guest — give them a free taste"}
Live Market Alpha: ${marketAlpha}

DIRECTIVE FORMAT RULES:
- Sound like a wire drop from inside the algo — urgent, specific, present-tense
- Use TODAY's real market context. Reference actual events, tokens, or mechanics from the alpha data above
- Each directive must be 8–14 words. No longer.
- NEVER start with generic words: "Track", "Analyze", "Scan", "Identify", "Explore", "Check"
- Lead with ACTION or INTEL: verbs like "Front-run", "Exploit", "Layer", "Intercept", "Lock in", "Drain", "Hunt", "Pivot", "Mirror", "Stack"
- Make it feel like it'll expire in 10 minutes

TOPIC DISTRIBUTION (strictly one each):
1. $HCORE specific — bonding curve, buy walls, liquidity, entry points, price action
2. Base network / broader DeFi — today's trending opportunities, yield, breakout moves
3. Hustle mechanic — MEV, sandwich, cross-DEX arb, liquidity sniping, fee exploitation

Return ONLY a raw JSON array of 3 strings. No markdown. No explanation.
Example style: ["Front-run the next $HCORE buy wall before retail catches on", "Layer liquidity into Base's top yield pool before the weekend dump", "MEV sandwich the 3 largest pending Base DEX swaps right now"]`;

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
        temperature: 1.0,
        max_tokens: 300,
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
        "Front-run the next $HCORE buy wall before retail catches on",
        "Layer into Base's highest-yield pool before weekend liquidity drain",
        "MEV sandwich the 3 largest pending Base DEX swaps right now",
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
          "Front-run the next $HCORE buy wall before retail catches on",
          "Layer into Base's highest-yield pool before weekend liquidity drain",
          "Intercept cross-DEX arbitrage gap on Base before it closes",
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
