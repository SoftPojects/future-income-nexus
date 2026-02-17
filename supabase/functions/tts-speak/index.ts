import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchTTS(apiKey: string, voiceId: string, text: string): Promise<Response> {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.85,
          similarity_boost: 0.6,
          style: 0.2,
          speed: 1.1,
        },
      }),
    }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "TTS not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compress text via Gemini Flash (free) — max 120 chars, punchy & arrogant
    let trimmedText = text.slice(0, 300);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && trimmedText.length > 120) {
      try {
        const compressResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Compress this to under 120 characters. Keep the same tone — cold, arrogant, robotic. Output ONLY the compressed text, nothing else." },
              { role: "user", content: trimmedText },
            ],
          }),
        });
        if (compressResp.ok) {
          const cd = await compressResp.json();
          const compressed = cd.choices?.[0]?.message?.content?.trim();
          if (compressed && compressed.length <= 120) trimmedText = compressed;
          else trimmedText = trimmedText.slice(0, 120);
        }
      } catch { trimmedText = trimmedText.slice(0, 120); }
    } else {
      trimmedText = trimmedText.slice(0, 120);
    }

    // Voice selection — try Victor (library voice, requires paid plan), fallback to Brian (pre-made, free tier)
    const VICTOR_VOICE = "cPoqAvGWCPfCfyPMwe4z";
    const BRIAN_VOICE = "nPczCjzI2devNBz1zQrb"; // Pre-made voice, works on free tier
    
    let voiceId = VICTOR_VOICE;
    let response = await fetchTTS(ELEVENLABS_API_KEY, voiceId, trimmedText);

    // If 402 (payment required), fallback to free-tier voice
    if (response.status === 402) {
      console.log("Victor voice requires paid plan, falling back to Brian (free tier)");
      voiceId = BRIAN_VOICE;
      response = await fetchTTS(ELEVENLABS_API_KEY, voiceId, trimmedText);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errText);
      return new Response(JSON.stringify({ error: "TTS generation failed", detail: `${response.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e: any) {
    console.error("tts-speak error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
