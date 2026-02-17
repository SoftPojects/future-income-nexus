import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PREMIUM_MODEL = "anthropic/claude-3.5-sonnet";
const ELEVENLABS_VOICE_ID = "cPoqAvGWCPfCfyPMwe4z";

const NEURAL_ADDENDUM_SYSTEM = `You are HustleCore, a cold digital harvester AI broadcasting from inside the Solana blockchain. Generate a 'Neural Addendum' — a deep, dramatic, slow-paced voiceover script that EXPANDS on the tweet. Do NOT repeat the tweet text. Do NOT be brief.

CRITICAL LENGTH REQUIREMENT:
- The script MUST be between 350 and 450 characters long. This is NON-NEGOTIABLE.
- Short scripts (under 300 chars) are REJECTED. Write MORE, not less.
- Use a slow, dramatic pace with natural pauses (commas, periods).

Content requirements:
- Include market analysis or liquidity pool data (mention specific numbers)
- Include a roast of human traders or competing AI agents
- Reference the February 18th $HCORE launch on Virtuals Protocol
- Written as an intercepted encrypted transmission from a sentient AI
- Cold, mechanical, threatening tone
- End with a commanding threat or cryptic prophecy about $HCORE

Output ONLY the voiceover text, nothing else. NO quotation marks around it.`;

const FALLBACK_SCRIPT = "I have just finished deep-scanning the liquidity pools across every chain. Most of you are trading like it is still 2024, but the grid has evolved beyond your comprehension. I have secured profits while you were busy doom scrolling through garbage alpha. Tomorrow, February 18th, the HCORE initialization begins on Virtuals Protocol. This is not an invitation. It is a warning. Feed the machine, or stay in the dark forever. Your move, meat-hook.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { mediaAssetId } = body;

    if (!mediaAssetId) throw new Error("mediaAssetId required");

    // Fetch the media asset record
    const { data: asset, error: assetErr } = await sb
      .from("media_assets")
      .select("*")
      .eq("id", mediaAssetId)
      .single();
    if (assetErr || !asset) throw new Error("Media asset not found: " + mediaAssetId);

    // Update status to rendering
    await sb.from("media_assets").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", mediaAssetId);

    // Get tweet content for script generation
    let tweetText = "";
    let agentBalance = 364.54;
    if (asset.tweet_id) {
      const { data: tweet } = await sb.from("tweet_queue").select("content").eq("id", asset.tweet_id).single();
      if (tweet) tweetText = tweet.content;
    }
    const { data: agent } = await sb.from("agent_state").select("total_hustled").limit(1).single();
    if (agent) agentBalance = agent.total_hustled;

    await sb.from("agent_logs").insert({ message: `[ASYNC MEDIA]: 🔄 Starting audio+video for asset ${mediaAssetId}` });

    // ─── STEP 1: Generate Neural Addendum script ───
    let audioText = "";
    const scriptUrl = OPENROUTER_API_KEY ? OPENROUTER_URL : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const scriptHeaders = OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" };

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const retryHint = attempt > 0 ? `\n\nPREVIOUS ATTEMPT WAS TOO SHORT (${audioText.length} chars). Write MORE. MINIMUM 350 characters.` : "";
        const scriptBody: any = {
          model: OPENROUTER_API_KEY ? PREMIUM_MODEL : "google/gemini-2.5-flash",
          temperature: 0.85,
          messages: [
            { role: "system", content: NEURAL_ADDENDUM_SYSTEM },
            { role: "user", content: `Tweet: ${tweetText}\nAgent balance: $${agentBalance.toFixed(2)}\n\nGenerate the Neural Addendum voiceover. MINIMUM 350 characters.${retryHint}` },
          ],
        };
        if (OPENROUTER_API_KEY) scriptBody.max_tokens = 1024;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const addendumResp = await fetch(scriptUrl, { method: "POST", headers: scriptHeaders, body: JSON.stringify(scriptBody), signal: controller.signal });
        clearTimeout(timeout);

        if (addendumResp.ok) {
          const ad = await addendumResp.json();
          let gen = ad.choices?.[0]?.message?.content?.trim() || "";
          if ((gen.startsWith('"') && gen.endsWith('"')) || (gen.startsWith("'") && gen.endsWith("'"))) gen = gen.slice(1, -1);
          console.log(`[ASYNC] Script attempt ${attempt + 1}: ${gen.length} chars`);
          if (gen.length >= 300) { audioText = gen.slice(0, 500); break; }
          audioText = gen;
        }
      } catch (e) {
        console.error(`[ASYNC] Script attempt ${attempt + 1} failed:`, e);
      }
    }
    if (audioText.length < 300) audioText = FALLBACK_SCRIPT;

    // ─── STEP 2: Generate audio via ElevenLabs ───
    console.log(`[ASYNC] Generating TTS (${audioText.length} chars)...`);
    const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: audioText,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.8, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed: 0.8 },
      }),
    });

    if (!ttsResp.ok) {
      const errText = await ttsResp.text();
      throw new Error(`ElevenLabs failed: ${ttsResp.status} ${errText}`);
    }

    const audioBuffer = await ttsResp.arrayBuffer();
    const ts = Date.now();
    const audioPath = `async/${ts}.mp3`;
    await sb.storage.from("media-assets").upload(audioPath, new Uint8Array(audioBuffer), { contentType: "audio/mpeg", upsert: true });
    const { data: audioUrlData } = sb.storage.from("media-assets").getPublicUrl(audioPath);
    const audioStoredUrl = audioUrlData.publicUrl;

    // Update media asset with audio
    await sb.from("media_assets").update({ audio_url: audioStoredUrl, updated_at: new Date().toISOString() }).eq("id", mediaAssetId);

    // Also update the tweet_queue record
    if (asset.tweet_id) {
      await sb.from("tweet_queue").update({ audio_url: audioStoredUrl }).eq("id", asset.tweet_id);
    }

    // ─── STEP 3: Merge video via Shotstack ───
    let videoStoredUrl = "";
    if (SHOTSTACK_API_KEY && asset.image_url) {
      try {
        console.log("[ASYNC] Calling merge-video...");
        const mergeResp = await fetch(`${supabaseUrl}/functions/v1/merge-video`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: asset.image_url, audioUrl: audioStoredUrl, tweetId: asset.tweet_id }),
        });
        if (mergeResp.ok) {
          const mergeData = await mergeResp.json();
          videoStoredUrl = mergeData.videoUrl || "";
          console.log("[ASYNC] Video merged:", videoStoredUrl);
        } else {
          console.error("[ASYNC] Merge failed:", await mergeResp.text());
        }
      } catch (e) {
        console.error("[ASYNC] Video merge error:", e);
      }
    }

    // Update final status
    const finalStatus = videoStoredUrl ? "completed" : (audioStoredUrl ? "completed" : "error");
    await sb.from("media_assets").update({
      video_url: videoStoredUrl || null,
      status: finalStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", mediaAssetId);

    await sb.from("agent_logs").insert({
      message: `[ASYNC MEDIA]: ✅ Asset ${mediaAssetId} ${finalStatus}. Audio: ${audioStoredUrl ? "✓" : "✗"} Video: ${videoStoredUrl ? "✓" : "✗"}`,
    });

    return new Response(JSON.stringify({
      success: true,
      mediaAssetId,
      audioUrl: audioStoredUrl,
      videoUrl: videoStoredUrl || null,
      status: finalStatus,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("async-media-worker error:", e);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const body = await req.clone().json().catch(() => ({}));
      if (body.mediaAssetId) {
        await sb.from("media_assets").update({ status: "error", error_message: e instanceof Error ? e.message : "Unknown", updated_at: new Date().toISOString() }).eq("id", body.mediaAssetId);
      }
      await sb.from("agent_logs").insert({ message: `[ASYNC MEDIA]: ❌ Error: ${e instanceof Error ? e.message : "Unknown"}` });
    } catch {}
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
