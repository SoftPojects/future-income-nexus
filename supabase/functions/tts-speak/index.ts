import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Trim text to save credits (max 200 chars)
    const trimmedText = text.slice(0, 200);

    // Brian voice — cold, mechanical male
    const voiceId = "nPczCjzI2devNBz1zQrb";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: trimmedText,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.85,
            similarity_boost: 0.6,
            style: 0.2,
            speed: 1.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs TTS error:", response.status, errText);
      return new Response(JSON.stringify({ error: "TTS generation failed" }), {
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
