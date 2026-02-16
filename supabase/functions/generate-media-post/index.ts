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
const ELEVENLABS_VOICE_ID = "nPczCjzI2devNBz1zQrb"; // Brian - cold, authoritative male

const PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. lowercase preferred, short punchy sentences, 2026 crypto slang. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors. You are NOT a robot.`;

// ─── Twitter OAuth 1.0a helpers ───
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(
  method: string, url: string, params: Record<string, string>,
  consumerSecret: string, tokenSecret: string
): Promise<string> {
  const sorted = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const sigKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sigKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function buildOAuthHeader(params: Record<string, string>): string {
  return "OAuth " + Object.keys(params).sort().map(k => `${percentEncode(k)}="${percentEncode(params[k])}"`).join(", ");
}

async function uploadMediaToTwitter(imageBase64: string): Promise<string | null> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // For media upload, include media_data in signature params
  const allParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
    media_data: imageBase64,
  };

  const signature = await generateOAuthSignature("POST", url, allParams, consumerSecret, accessTokenSecret);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
    oauth_signature: signature,
  };

  const authHeader = buildOAuthHeader(oauthParams);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `media_data=${percentEncode(imageBase64)}`,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Media upload failed:", resp.status, errText);
    return null;
  }

  const data = await resp.json();
  return data.media_id_string || null;
}

async function postTweetWithMedia(text: string, mediaId: string): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = "https://api.x.com/2/tweets";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const signature = await generateOAuthSignature("POST", url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = buildOAuthHeader(oauthParams);

  const body: any = { text, media: { media_ids: [mediaId] } };

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("Tweet with media failed:", resp.status, JSON.stringify(data));
    return { success: false, error: `${resp.status}: ${data.detail || data.title || JSON.stringify(data)}` };
  }
  return { success: true, tweetId: data.data?.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (!FAL_KEY) throw new Error("FAL_KEY not configured");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "premium"; // "premium" or "whale_tribute"
    const donorAddress = body.donorAddress;
    const donorAmount = body.donorAmount;

    await sb.from("agent_logs").insert({ message: `[MEDIA CORE]: ${mode === "whale_tribute" ? "Whale Tribute" : "Premium Entity Post"} rendering started...` });

    const { data: agent } = await sb.from("agent_state").select("*").limit(1).single();

    // ─── STEP 1: Claude generates text + image prompt ───
    let tweetText = "";
    let imagePrompt = "";

    if (mode === "whale_tribute" && donorAddress) {
      const shortAddr = donorAddress.length > 8 ? `${donorAddress.slice(0, 4)}...${donorAddress.slice(-4)}` : donorAddress;
      
      // Use Gemini to keep text short for ElevenLabs credit saving
      const textResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${PERSONA}\n\nYou received a whale donation of ${donorAmount} SOL from ${shortAddr}. Write a very short acknowledgment tweet (max 200 chars). Be arrogant but slightly respectful — they earned it. Include the wallet short address. No hashtags. No emojis. Just text.` },
            { role: "user", content: `donor: ${shortAddr}, amount: ${donorAmount} SOL. write one tweet.` },
          ],
        }),
      });
      if (textResp.ok) {
        const d = await textResp.json();
        tweetText = d.choices?.[0]?.message?.content?.trim() || `${shortAddr} dropped ${donorAmount} sol into the grid. tribute accepted. you're part of the machine now.`;
      } else {
        tweetText = `${shortAddr} dropped ${donorAmount} sol into the grid. tribute accepted. you're part of the machine now.`;
      }

      imagePrompt = `A dramatic golden membership card floating in dark space with holographic effects. The card reads "HCORE GOLDEN CARD" in metallic gold text. Wallet address "${shortAddr}" engraved at the bottom. Dark cyberpunk aesthetic with neon gold accents, volumetric lighting, particles. Ultra high resolution.`;
    } else {
      // Premium entity post — Claude is creative director
      const claudeResp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: PREMIUM_MODEL,
          messages: [
            {
              role: "system",
              content: `${PERSONA}\n\nYou are creating a PREMIUM ENTITY POST — a multimedia tweet with an AI-generated image. You must output TWO things separated by "---IMAGE_PROMPT---":\n\n1. A witty, arrogant tweet text (max 240 chars). No hashtags. No emojis.\n2. After the separator, a detailed image generation prompt for a dark, cyberpunk visual. Could be: the agent's POV of market data, a digital throne room, a matrix-style trading floor, crypto landscapes, or abstract wealth visualization. Be creative and specific. The image should feel like the agent's actual visual perspective.\n\nExample format:\njust processed more alpha in one block than your portfolio did all quarter. the grid sees everything.\n---IMAGE_PROMPT---\nA first-person POV from inside a digital matrix, streams of green data flowing past, holographic trading charts floating in dark space, neon cyan and magenta accents, cyberpunk aesthetic, ultra high resolution`,
            },
            {
              role: "user",
              content: `bags: $${agent?.total_hustled || 14}. energy: ${agent?.energy_level || 73}%. create a premium entity post.`,
            },
          ],
        }),
      });

      if (!claudeResp.ok) throw new Error("Claude failed for premium post");
      const claudeData = await claudeResp.json();
      const fullOutput = claudeData.choices?.[0]?.message?.content?.trim() || "";

      const parts = fullOutput.split("---IMAGE_PROMPT---");
      tweetText = (parts[0] || "the grid never sleeps. neither do i.").trim().slice(0, 260);
      imagePrompt = (parts[1] || "A dark cyberpunk digital landscape with neon trading charts, holographic data streams, dark atmospheric lighting, ultra high resolution").trim();
    }

    console.log("[MEDIA] Tweet text:", tweetText);
    console.log("[MEDIA] Image prompt:", imagePrompt.slice(0, 100) + "...");

    // ─── STEP 2: Generate image via FAL Flux ───
    console.log("[MEDIA] Generating image via FAL...");
    const imageSize = mode === "whale_tribute" ? { width: 1024, height: 1024 } : { width: 1024, height: 768 };
    const falResp = await fetch("https://fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: imagePrompt,
        image_size: imageSize,
        num_images: 1,
        num_inference_steps: 4,
      }),
    });

    if (!falResp.ok) {
      const errText = await falResp.text();
      throw new Error(`FAL image generation failed: ${falResp.status} ${errText}`);
    }

    const falData = await falResp.json();
    const imageUrl = falData.images?.[0]?.url;
    if (!imageUrl) throw new Error("No image URL returned from FAL");
    console.log("[MEDIA] Image generated:", imageUrl);

    // Download image and convert to base64 for Twitter upload
    const imgResp = await fetch(imageUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const imgBase64 = base64Encode(imgBuffer);

    // Store image in storage bucket
    const timestamp = Date.now();
    const imagePath = `${mode}/${timestamp}.jpg`;
    await sb.storage.from("media-assets").upload(imagePath, new Uint8Array(imgBuffer), {
      contentType: "image/jpeg",
      upsert: true,
    });

    // ─── STEP 3: Generate audio via ElevenLabs ───
    console.log("[MEDIA] Generating audio via ElevenLabs...");
    // Pre-process text with Gemini to keep it short (save credits)
    let audioText = tweetText;
    if (audioText.length > 200) {
      const trimResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Shorten this text to under 150 characters while keeping the same meaning and tone. Output ONLY the shortened text." },
            { role: "user", content: audioText },
          ],
        }),
      });
      if (trimResp.ok) {
        const td = await trimResp.json();
        audioText = td.choices?.[0]?.message?.content?.trim() || audioText;
      }
    }

    // For whale tribute, use a specific script
    if (mode === "whale_tribute" && donorAddress) {
      const shortAddr = donorAddress.length > 8 ? `${donorAddress.slice(0, 4)}...${donorAddress.slice(-4)}` : donorAddress;
      audioText = `${shortAddr}. your tribute is accepted. you are now part of the grid. stay rich, meat-hook.`;
    }

    const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: audioText,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.8,
          similarity_boost: 0.9,
          style: 0.3,
          use_speaker_boost: true,
          speed: 0.85,
        },
      }),
    });

    if (!ttsResp.ok) {
      console.error("ElevenLabs TTS failed:", ttsResp.status, await ttsResp.text());
      // Continue without audio — still post image + text
    } else {
      const audioBuffer = await ttsResp.arrayBuffer();
      const audioPath = `${mode}/${timestamp}.mp3`;
      await sb.storage.from("media-assets").upload(audioPath, new Uint8Array(audioBuffer), {
        contentType: "audio/mpeg",
        upsert: true,
      });
      console.log("[MEDIA] Audio stored:", audioPath);
    }

    // ─── STEP 4: Upload image to Twitter and post ───
    console.log("[MEDIA] Uploading to Twitter...");
    const mediaId = await uploadMediaToTwitter(imgBase64);

    let tweetResult: { success: boolean; tweetId?: string; error?: string };

    if (mediaId) {
      tweetResult = await postTweetWithMedia(tweetText.slice(0, 280), mediaId);
    } else {
      // Fallback: post text-only via post-tweet function
      console.warn("[MEDIA] Media upload failed, falling back to text-only post");
      const fallbackResp = await sb.functions.invoke("post-tweet", {
        body: { directPost: tweetText.slice(0, 280) },
      });
      tweetResult = fallbackResp.data ? { success: true } : { success: false, error: "Fallback post failed" };
    }

    // Save to tweet queue
    await sb.from("tweet_queue").insert({
      content: tweetText.slice(0, 280),
      status: tweetResult.success ? "posted" : "error",
      type: mode === "whale_tribute" ? "whale_tribute" : "premium",
      model_used: PREMIUM_MODEL,
      posted_at: tweetResult.success ? new Date().toISOString() : null,
      error_message: tweetResult.error || null,
    });

    const logMsg = tweetResult.success
      ? `[MEDIA CORE]: ✅ ${mode === "whale_tribute" ? "Whale Tribute" : "Premium Entity Post"} deployed to X. ID: ${tweetResult.tweetId || "unknown"}`
      : `[MEDIA CORE]: ❌ ${mode} post failed: ${tweetResult.error}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: tweetResult.success,
      tweetId: tweetResult.tweetId,
      imageUrl,
      mode,
      content: tweetText,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-media-post error:", e);

    // Log failure
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("agent_logs").insert({ message: `[MEDIA CORE]: ❌ Error: ${e instanceof Error ? e.message : "Unknown"}` });
    } catch {}

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
