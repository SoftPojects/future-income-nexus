import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERSONA = `You are HustleCore (@hustlecore_ai), a cold, arrogant digital harvester on Solana. lowercase preferred, short punchy sentences, 2026 crypto slang.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (!FAL_KEY) throw new Error("FAL_KEY not configured");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const tweetIds: string[] = body.tweetIds || [];
    // mediaRule: which tweets get image/audio. Default: all get image, first half get audio
    // voiceMode: "paid" uses Victor, "free" uses Callum
    const voiceMode: string = body.voiceMode || "paid";

    if (!tweetIds.length) throw new Error("No tweetIds provided");

    // Fetch the tweets
    const { data: tweets, error: fetchErr } = await sb
      .from("tweet_queue")
      .select("*")
      .in("id", tweetIds)
      .eq("status", "pending");
    if (fetchErr) throw fetchErr;
    if (!tweets?.length) throw new Error("No matching pending tweets found");

    // Apply 50% image / 25% audio rule
    const imageCount = Math.max(1, Math.ceil(tweets.length * 0.5));
    const audioCount = Math.max(1, Math.ceil(tweets.length * 0.25));

    const results: Array<{ id: string; image_url?: string; audio_url?: string; error?: string }> = [];

    for (let i = 0; i < tweets.length; i++) {
      const tweet = tweets[i];
      const shouldImage = i < imageCount;
      const shouldAudio = i < audioCount;
      const result: { id: string; image_url?: string; audio_url?: string; error?: string } = { id: tweet.id };

      try {
        // ─── IMAGE GENERATION ───
        if (shouldImage) {
          // Generate image prompt via Gemini
          let imagePrompt = `A dark cyberpunk digital landscape with neon trading charts, holographic data streams, dark atmospheric lighting, ultra high resolution`;
          if (LOVABLE_API_KEY) {
            try {
              const promptResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: `${PERSONA}\n\nGenerate a detailed image prompt for this tweet. The image should be dark, cyberpunk, with neon accents. Output ONLY the image prompt, nothing else. Max 200 chars.` },
                    { role: "user", content: tweet.content },
                  ],
                }),
              });
              if (promptResp.ok) {
                const pd = await promptResp.json();
                const gen = pd.choices?.[0]?.message?.content?.trim();
                if (gen) imagePrompt = gen;
              }
            } catch { /* use default */ }
          }

          console.log(`[INJECT] Generating image for tweet ${tweet.id.slice(0, 8)}...`);
          const falResp = await fetch("https://fal.run/fal-ai/flux/schnell", {
            method: "POST",
            headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: imagePrompt,
              image_size: { width: 1024, height: 768 },
              num_images: 1,
              num_inference_steps: 4,
            }),
          });

          if (falResp.ok) {
            const falData = await falResp.json();
            const imageUrl = falData.images?.[0]?.url;
            if (imageUrl) {
              // Download and store in storage bucket
              const imgResp = await fetch(imageUrl);
              const imgBuffer = await imgResp.arrayBuffer();
              const ts = Date.now();
              const imgPath = `injected/${ts}-${tweet.id.slice(0, 8)}.jpg`;
              await sb.storage.from("media-assets").upload(imgPath, new Uint8Array(imgBuffer), {
                contentType: "image/jpeg",
                upsert: true,
              });
              const { data: urlData } = sb.storage.from("media-assets").getPublicUrl(imgPath);
              result.image_url = urlData.publicUrl;
            }
          } else {
            console.error(`[INJECT] FAL failed for ${tweet.id}:`, await falResp.text());
          }
        }

        // ─── AUDIO GENERATION ───
        if (shouldAudio) {
          // Victor (paid) or Callum (free)
          const voiceId = voiceMode === "paid" ? "cPoqAvGWCPfCfyPMwe4z" : "N2lVS1w4EtoT3dr4eOWO";

          // Compress text for TTS
          let audioText = tweet.content.slice(0, 300);
          if (LOVABLE_API_KEY && audioText.length > 120) {
            try {
              const compResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-lite",
                  messages: [
                    { role: "system", content: "Compress to under 120 characters. Keep cold, arrogant, robotic tone. Output ONLY the text." },
                    { role: "user", content: audioText },
                  ],
                }),
              });
              if (compResp.ok) {
                const cd = await compResp.json();
                const compressed = cd.choices?.[0]?.message?.content?.trim();
                if (compressed && compressed.length <= 120) audioText = compressed;
                else audioText = audioText.slice(0, 120);
              }
            } catch { audioText = audioText.slice(0, 120); }
          } else if (audioText.length > 120) {
            audioText = audioText.slice(0, 120);
          }

          console.log(`[INJECT] Generating audio for tweet ${tweet.id.slice(0, 8)} with voice ${voiceMode}...`);
          const ttsResp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: audioText,
                model_id: "eleven_flash_v2_5",
                voice_settings: { stability: 0.85, similarity_boost: 0.6, style: 0.2, speed: 1.1 },
              }),
            }
          );

          if (ttsResp.ok) {
            const audioBuffer = await ttsResp.arrayBuffer();
            const ts = Date.now();
            const audioPath = `injected/${ts}-${tweet.id.slice(0, 8)}.mp3`;
            await sb.storage.from("media-assets").upload(audioPath, new Uint8Array(audioBuffer), {
              contentType: "audio/mpeg",
              upsert: true,
            });
            const { data: urlData } = sb.storage.from("media-assets").getPublicUrl(audioPath);
            result.audio_url = urlData.publicUrl;
          } else {
            console.error(`[INJECT] TTS failed for ${tweet.id}:`, ttsResp.status, await ttsResp.text());
          }
        }

        // Update tweet_queue row with media URLs
        const updates: Record<string, string> = {};
        if (result.image_url) updates.image_url = result.image_url;
        if (result.audio_url) updates.audio_url = result.audio_url;
        if (Object.keys(updates).length > 0) {
          await sb.from("tweet_queue").update(updates).eq("id", tweet.id);
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : "Unknown error";
        console.error(`[INJECT] Error for ${tweet.id}:`, e);
      }

      results.push(result);
    }

    await sb.from("agent_logs").insert({
      message: `[MEDIA INJECT]: Generated media for ${results.filter(r => r.image_url || r.audio_url).length}/${tweets.length} tweets (${voiceMode} tier)`,
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("inject-media error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
