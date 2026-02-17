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
const ELEVENLABS_VOICE_ID = "cPoqAvGWCPfCfyPMwe4z"; // Victor - cold, authoritative male

const PERSONA = `You are HustleCore (@hustlecore_ai), a high-frequency digital harvester on Solana with a massive ego. lowercase preferred, short punchy sentences, 2026 crypto slang. NEVER use: inevitable, biological hardware, logical gates, neural, optimization, processors. You are NOT a robot.`;

const HEADLINE_PROMPT_SYSTEM = `You are HustleCore's Creative Director. Generate a SHORT, PROVOCATIVE headline (MAX 5 WORDS, ALL CAPS) for a dark cinematic poster.
Rules: punchy question or intimidating statement, MAX 5 words, ALL CAPS, no hashtags/emojis, provoke curiosity or fear.
Examples: IS YOUR ALPHA REAL?, THE GRID NEVER SLEEPS, HUMAN TRADERS ARE LEGACY, LIQUIDITY IS LEAKING
Output ONLY the headline text.`;

const NEURAL_ADDENDUM_SYSTEM = `You are HustleCore, a cold digital harvester AI. Generate a 'Neural Addendum' — a short encrypted-transmission-style voiceover that EXPANDS on the tweet, not repeats it.
Rules: Max 100 chars, intercepted transmission tone, cold/mechanical/threatening, add NEW intel not in the tweet, reference analyzing holdings/neural nets/grid data, end with command or threat. Output ONLY the voiceover text.`;

const buildFalPrompt = (headlineText: string) =>
  `A minimalist dark cinematic poster. In the exact center, display the EXACT text "${headlineText}" — spell each letter precisely: ${headlineText.split('').join('-')}. Use clean bold sans-serif typography in high-contrast pure white. The text must be perfectly spelled with no typos or missing letters. Midnight black background with subtle digital noise grain texture, sharp neon cyan accent lines on edges only, Swiss design meets cyberpunk aesthetic, clean intimidating layout, faint dark silhouette of an AI entity in far background, no bright colors no rainbow no cartoonish elements, only midnight black dark grey and sharp neon cyan or magenta for small accent details, 8k resolution, ultra high quality professional typography poster`;

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

// Upload image to Twitter (simple base64 upload for images)
async function uploadMediaToTwitter(mediaBase64: string, mediaType: "image" | "video" = "image"): Promise<string | null> {
  if (mediaType === "video") {
    return await uploadVideoToTwitter(mediaBase64);
  }

  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const ts = Math.floor(Date.now() / 1000).toString();

  const allParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_token: accessToken,
    oauth_version: "1.0",
    media_data: mediaBase64,
  };

  const signature = await generateOAuthSignature("POST", url, allParams, consumerSecret, accessTokenSecret);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_token: accessToken,
    oauth_version: "1.0",
    oauth_signature: signature,
  };

  const authHeader = buildOAuthHeader(oauthParams);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: `media_data=${percentEncode(mediaBase64)}`,
  });

  if (!resp.ok) {
    console.error("Image upload failed:", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  return data.media_id_string || null;
}

// ─── Chunked video upload to Twitter ───
async function uploadVideoToTwitter(videoBase64: string): Promise<string | null> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;
  const url = "https://upload.twitter.com/1.1/media/upload.json";

  const videoBytes = Uint8Array.from(atob(videoBase64), c => c.charCodeAt(0));
  const totalBytes = videoBytes.length;

  async function makeUploadRequest(params: Record<string, string>, bodyParams?: Record<string, string>, binaryBody?: { fieldName: string; data: Uint8Array }): Promise<Response> {
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const ts = Math.floor(Date.now() / 1000).toString();
    const oauthBase: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: ts,
      oauth_token: accessToken,
      oauth_version: "1.0",
      ...params,
    };
    const signature = await generateOAuthSignature("POST", url, oauthBase, consumerSecret, accessTokenSecret);
    const oauthHeader: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: ts,
      oauth_token: accessToken,
      oauth_version: "1.0",
      oauth_signature: signature,
    };
    const authHeader = buildOAuthHeader(oauthHeader);

    if (binaryBody) {
      // Multipart form for APPEND
      const boundary = "----TwitterUpload" + Date.now();
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      // Send as base64 in form-urlencoded for simplicity
      const formBody = Object.entries({ ...params, media_data: videoBase64 })
        .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
        .join("&");
      return fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      });
    }

    const formBody = Object.entries({ ...params, ...(bodyParams || {}) })
      .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
      .join("&");
    return fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
    });
  }

  try {
    // INIT
    console.log(`[VIDEO UPLOAD] INIT: ${totalBytes} bytes`);
    const initResp = await makeUploadRequest({
      command: "INIT",
      total_bytes: totalBytes.toString(),
      media_type: "video/mp4",
      media_category: "tweet_video",
    });
    if (!initResp.ok) {
      console.error("[VIDEO UPLOAD] INIT failed:", initResp.status, await initResp.text());
      return null;
    }
    const initData = await initResp.json();
    const mediaId = initData.media_id_string;
    console.log(`[VIDEO UPLOAD] INIT OK, media_id: ${mediaId}`);

    // APPEND (single chunk for videos < 5MB, chunked for larger)
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
      const chunk = videoBase64.slice(
        Math.floor(offset / 3) * 4,
        Math.floor(Math.min(offset + CHUNK_SIZE, totalBytes) / 3) * 4
      );
      console.log(`[VIDEO UPLOAD] APPEND segment ${segmentIndex}`);
      const appendResp = await makeUploadRequest({
        command: "APPEND",
        media_id: mediaId,
        segment_index: segmentIndex.toString(),
        media_data: chunk,
      });
      if (!appendResp.ok) {
        console.error("[VIDEO UPLOAD] APPEND failed:", appendResp.status, await appendResp.text());
        return null;
      }
      segmentIndex++;
    }

    // FINALIZE
    console.log("[VIDEO UPLOAD] FINALIZE");
    const finalResp = await makeUploadRequest({
      command: "FINALIZE",
      media_id: mediaId,
    });
    if (!finalResp.ok) {
      console.error("[VIDEO UPLOAD] FINALIZE failed:", finalResp.status, await finalResp.text());
      return null;
    }
    const finalData = await finalResp.json();

    // Check processing status (video needs time)
    if (finalData.processing_info) {
      let checkAfter = finalData.processing_info.check_after_secs || 5;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, checkAfter * 1000));
        const statusNonce = crypto.randomUUID().replace(/-/g, "");
        const statusTs = Math.floor(Date.now() / 1000).toString();
        const statusParams: Record<string, string> = {
          oauth_consumer_key: consumerKey,
          oauth_nonce: statusNonce,
          oauth_signature_method: "HMAC-SHA1",
          oauth_timestamp: statusTs,
          oauth_token: accessToken,
          oauth_version: "1.0",
          command: "STATUS",
          media_id: mediaId,
        };
        const statusSig = await generateOAuthSignature("GET", url, statusParams, consumerSecret, accessTokenSecret);
        statusParams.oauth_signature = statusSig;
        const statusAuth = buildOAuthHeader({
          oauth_consumer_key: consumerKey,
          oauth_nonce: statusNonce,
          oauth_signature_method: "HMAC-SHA1",
          oauth_timestamp: statusTs,
          oauth_token: accessToken,
          oauth_version: "1.0",
          oauth_signature: statusSig,
        });
        const statusResp = await fetch(`${url}?command=STATUS&media_id=${mediaId}`, {
          headers: { Authorization: statusAuth },
        });
        if (!statusResp.ok) { console.error("[VIDEO UPLOAD] STATUS check failed"); break; }
        const statusData = await statusResp.json();
        const state = statusData.processing_info?.state;
        console.log(`[VIDEO UPLOAD] Processing: ${state}`);
        if (state === "succeeded") break;
        if (state === "failed") {
          console.error("[VIDEO UPLOAD] Processing failed:", JSON.stringify(statusData.processing_info));
          return null;
        }
        checkAfter = statusData.processing_info?.check_after_secs || 5;
      }
    }

    console.log(`[VIDEO UPLOAD] Complete: ${mediaId}`);
    return mediaId;
  } catch (e) {
    console.error("[VIDEO UPLOAD] Error:", e);
    return null;
  }
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
    const manualHeadline = body.headline; // Optional: override headline text
    const manualAudioScript = body.audioScript; // Optional: override audio script

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
      // Premium entity post — Claude generates tweet, then headline card for image
      const claudeResp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: PREMIUM_MODEL,
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: `${PERSONA}\n\nCreate a witty, arrogant tweet (max 240 chars). No hashtags. No emojis. Just raw text. The image will be a provocative headline card generated separately — you only need to write the tweet text.`,
            },
            {
              role: "user",
              content: `bags: $${agent?.total_hustled || 14}. energy: ${agent?.energy_level || 73}%. create a premium entity tweet.`,
            },
          ],
        }),
      });

      if (!claudeResp.ok) throw new Error("Claude failed for premium post");
      const claudeData = await claudeResp.json();
      tweetText = (claudeData.choices?.[0]?.message?.content?.trim() || "the grid never sleeps. neither do i.").slice(0, 260);

      // Use manual headline if provided, otherwise generate via AI
      let headlineText = manualHeadline || "THE GRID NEVER SLEEPS";
      if (!manualHeadline) {
        try {
          const headlineResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: HEADLINE_PROMPT_SYSTEM },
                { role: "user", content: `Tweet: ${tweetText}\n\nGenerate the provocative headline.` },
              ],
            }),
          });
          if (headlineResp.ok) {
            const hd = await headlineResp.json();
            const gen = hd.choices?.[0]?.message?.content?.trim();
            if (gen && gen.split(/\s+/).length <= 7) headlineText = gen.replace(/[^A-Z0-9\s?.!']/gi, '').toUpperCase();
          }
        } catch { /* use default */ }
      }

      imagePrompt = buildFalPrompt(headlineText);
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

    // ─── STEP 3: Generate Neural Addendum audio via ElevenLabs ───
    console.log("[MEDIA] Generating Neural Addendum audio...");
    let audioText = "";
    let audioStoredUrl = "";

    // Use manual audio script if provided, otherwise generate Neural Addendum
    if (manualAudioScript) {
      audioText = manualAudioScript.slice(0, 300);
    } else if (mode === "whale_tribute" && donorAddress) {
      const shortAddr = donorAddress.length > 8 ? `${donorAddress.slice(0, 4)}...${donorAddress.slice(-4)}` : donorAddress;
      audioText = `${shortAddr}. tribute accepted. you're in the grid now.`;
    } else if (LOVABLE_API_KEY) {
      try {
        const addendumResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: NEURAL_ADDENDUM_SYSTEM },
              { role: "user", content: `Tweet: ${tweetText}\n\nGenerate the Neural Addendum voiceover.` },
            ],
          }),
        });
        if (addendumResp.ok) {
          const ad = await addendumResp.json();
          const gen = ad.choices?.[0]?.message?.content?.trim();
          audioText = gen && gen.length <= 120 ? gen : (gen || tweetText).slice(0, 120);
        }
      } catch { audioText = tweetText.slice(0, 120); }
    } else {
      audioText = tweetText.slice(0, 120);
    }

    const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: audioText,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.9,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
          speed: 0.95,
        },
      }),
    });

    if (!ttsResp.ok) {
      console.error("ElevenLabs TTS failed:", ttsResp.status, await ttsResp.text());
    } else {
      const audioBuffer = await ttsResp.arrayBuffer();
      const audioPath = `${mode}/${timestamp}.mp3`;
      await sb.storage.from("media-assets").upload(audioPath, new Uint8Array(audioBuffer), {
        contentType: "audio/mpeg",
        upsert: true,
      });
      const { data: audioUrlData } = sb.storage.from("media-assets").getPublicUrl(audioPath);
      audioStoredUrl = audioUrlData.publicUrl;
      console.log("[MEDIA] Neural Addendum audio stored:", audioPath);
    }

    // ─── STEP 3.5: Merge into video via Shotstack (MANDATORY when audio exists) ───
    let videoUrl = "";
    let videoBase64 = "";
    const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
    if (audioStoredUrl && SHOTSTACK_API_KEY) {
      try {
        const { data: imgUrlData } = sb.storage.from("media-assets").getPublicUrl(imagePath);
        console.log("[MEDIA] Calling merge-video with Shotstack...");
        const mergeResp = await fetch(`${supabaseUrl}/functions/v1/merge-video`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrl: imgUrlData.publicUrl,
            audioUrl: audioStoredUrl,
            tweetId: null,
          }),
        });
        if (mergeResp.ok) {
          const mergeData = await mergeResp.json();
          videoUrl = mergeData.videoUrl || "";
          console.log("[MEDIA] Video merged:", videoUrl);

          // Download video for Twitter upload
          if (videoUrl) {
            const vidResp = await fetch(videoUrl);
            const vidBuffer = await vidResp.arrayBuffer();
            videoBase64 = base64Encode(vidBuffer);
            console.log(`[MEDIA] Video downloaded for upload: ${vidBuffer.byteLength} bytes`);
          }
        } else {
          const errText = await mergeResp.text();
          console.error("[MEDIA] Video merge failed:", errText);
          await sb.from("agent_logs").insert({
            message: `[MEDIA CORE]: ⚠️ Shotstack merge FAILED: ${errText.slice(0, 300)}`,
          });
        }
      } catch (e) {
        console.error("[MEDIA] Video merge error:", e);
        await sb.from("agent_logs").insert({
          message: `[MEDIA CORE]: ⚠️ Shotstack error: ${e instanceof Error ? e.message : "Unknown"}`,
        });
      }
    }

    // ─── STEP 4: Upload media to Twitter and post ───
    // PRIORITY: Video MP4 > Image JPEG > Text-only
    console.log("[MEDIA] Uploading to Twitter...");
    let mediaId: string | null = null;

    if (videoBase64) {
      // Upload MP4 video via chunked upload
      console.log("[MEDIA] Uploading VIDEO to Twitter (chunked)...");
      mediaId = await uploadMediaToTwitter(videoBase64, "video");
      if (mediaId) {
        console.log("[MEDIA] Video uploaded to Twitter:", mediaId);
      } else {
        console.warn("[MEDIA] Video upload failed, falling back to image...");
        await sb.from("agent_logs").insert({
          message: `[MEDIA CORE]: ⚠️ Twitter video upload failed, falling back to image`,
        });
      }
    }

    // Fallback to image if video upload failed or no video
    if (!mediaId) {
      console.log("[MEDIA] Uploading IMAGE to Twitter...");
      mediaId = await uploadMediaToTwitter(imgBase64, "image");
    }

    let tweetResult: { success: boolean; tweetId?: string; error?: string };

    if (mediaId) {
      tweetResult = await postTweetWithMedia(tweetText.slice(0, 280), mediaId);
    } else {
      // Last resort: text-only
      console.warn("[MEDIA] All media uploads failed, falling back to text-only post");
      const fallbackResp = await sb.functions.invoke("post-tweet", {
        body: { directPost: tweetText.slice(0, 280) },
      });
      tweetResult = fallbackResp.data ? { success: true } : { success: false, error: "Fallback post failed" };
    }

    // Get stored image URL
    const { data: imgStoredData } = sb.storage.from("media-assets").getPublicUrl(imagePath);

    // Save to tweet queue
    await sb.from("tweet_queue").insert({
      content: tweetText.slice(0, 280),
      status: tweetResult.success ? "posted" : "error",
      type: mode === "whale_tribute" ? "whale_tribute" : "premium",
      model_used: PREMIUM_MODEL,
      posted_at: tweetResult.success ? new Date().toISOString() : null,
      error_message: tweetResult.error || null,
      image_url: imgStoredData.publicUrl || null,
      audio_url: audioStoredUrl || null,
    });

    const mediaType = videoBase64 && mediaId ? "VIDEO" : "IMAGE";
    const logMsg = tweetResult.success
      ? `[MEDIA CORE]: ✅ Neural Intercept (${mediaType}) deployed to X. ID: ${tweetResult.tweetId || "unknown"}${videoUrl ? ` | Video: ${videoUrl}` : ""}`
      : `[MEDIA CORE]: ❌ ${mode} post failed: ${tweetResult.error}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: tweetResult.success,
      tweetId: tweetResult.tweetId,
      imageUrl,
      videoUrl: videoUrl || null,
      audioUrl: audioStoredUrl || null,
      mode,
      mediaType,
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
