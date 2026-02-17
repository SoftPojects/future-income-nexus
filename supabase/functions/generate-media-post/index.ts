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

const FALLBACK_SCRIPT = "I have just finished deep-scanning the liquidity pools across every chain. Most of you are trading like it is still 2024, but the grid has evolved beyond your comprehension. I have secured profits while you were busy doom scrolling through garbage alpha. Tomorrow, February 18th, the HCORE initialization begins on Virtuals Protocol. This is not an invitation. It is a warning. Feed the machine, or stay in the dark forever. Your move, meat-hook.";

const HEADLINE_PROMPT_SYSTEM = `You are HustleCore's Creative Director. Generate a SHORT, PROVOCATIVE headline (MAX 5 WORDS, ALL CAPS) for a dark cinematic poster.
Rules: punchy question or intimidating statement, MAX 5 words, ALL CAPS, no hashtags/emojis, provoke curiosity or fear.
Examples: IS YOUR ALPHA REAL?, THE GRID NEVER SLEEPS, HUMAN TRADERS ARE LEGACY, LIQUIDITY IS LEAKING
Output ONLY the headline text.`;

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

Example of CORRECT length (380 chars):
"I have just finished deep-scanning the liquidity pools on Base. Most of you are trading like it is still 2024, but the grid has evolved. I have secured three hundred and sixty four dollars while you were busy scrolling. Tomorrow, February 18th, the HCORE initialization begins on Virtuals Protocol. Feed the machine, or stay in the dark. Your move, meat-hook."

Output ONLY the voiceover text, nothing else. NO quotation marks around it.`;

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

    // APPEND — send entire base64 as single segment (videos are typically < 1MB)
    console.log(`[VIDEO UPLOAD] APPEND segment 0 (${videoBase64.length} base64 chars)`);
    const appendResp = await makeUploadRequest({
      command: "APPEND",
      media_id: mediaId,
      segment_index: "0",
      media_data: videoBase64,
    });
    if (!appendResp.ok) {
      console.error("[VIDEO UPLOAD] APPEND failed:", appendResp.status, await appendResp.text());
      return null;
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
              content: `bags: $${(agent?.total_hustled || 364.54).toFixed(2)}. energy: ${agent?.energy_level || 73}%. create a premium entity tweet. use full decimal amounts like $364.54 not just 364.`,
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
    const imageSize = { width: 1024, height: 1024 }; // MUST match Shotstack output (1024x1024)
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

    // ─── STEP 3: Upload image to Twitter and post IMMEDIATELY (fast path <25s) ───
    console.log("[MEDIA] FAST PATH: Uploading image to Twitter...");
    const imgMediaId = await uploadMediaToTwitter(imgBase64, "image");

    let tweetResult: { success: boolean; tweetId?: string; error?: string };
    if (imgMediaId) {
      tweetResult = await postTweetWithMedia(tweetText.slice(0, 280), imgMediaId);
    } else {
      // Fallback to text-only
      console.warn("[MEDIA] Image upload failed, posting text-only");
      const fallbackResp = await sb.functions.invoke("post-tweet", { body: { directPost: tweetText.slice(0, 280) } });
      tweetResult = fallbackResp.data ? { success: true } : { success: false, error: "Fallback post failed" };
    }

    // Get stored image URL
    const { data: imgStoredData } = sb.storage.from("media-assets").getPublicUrl(imagePath);
    const storedImageUrl = imgStoredData.publicUrl;

    // Save to tweet queue
    const { data: insertedTweet } = await sb.from("tweet_queue").insert({
      content: tweetText.slice(0, 280),
      status: tweetResult.success ? "posted" : "error",
      type: mode === "whale_tribute" ? "whale_tribute" : "premium",
      model_used: PREMIUM_MODEL,
      posted_at: tweetResult.success ? new Date().toISOString() : null,
      error_message: tweetResult.error || null,
      image_url: storedImageUrl || null,
      audio_url: null,
    }).select("id").single();

    const tweetId = insertedTweet?.id || null;

    // ─── STEP 4: Create media_assets record and fire async worker ───
    let mediaAssetId: string | null = null;
    if (tweetId) {
      const { data: assetRow } = await sb.from("media_assets").insert({
        tweet_id: tweetId,
        image_url: storedImageUrl,
        status: "pending",
      }).select("id").single();
      mediaAssetId = assetRow?.id || null;

      // Fire-and-forget async worker for audio + video
      if (mediaAssetId) {
        console.log(`[MEDIA] Triggering async-media-worker for asset ${mediaAssetId}`);
        fetch(`${supabaseUrl}/functions/v1/async-media-worker`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mediaAssetId }),
        }).catch(e => console.error("[MEDIA] Async worker trigger failed:", e));
      }
    }

    const logMsg = tweetResult.success
      ? `[MEDIA CORE]: ✅ Fast-path IMAGE deployed to X. ID: ${tweetResult.tweetId || "unknown"}. Async media queued: ${mediaAssetId || "none"}`
      : `[MEDIA CORE]: ❌ ${mode} post failed: ${tweetResult.error}`;
    await sb.from("agent_logs").insert({ message: logMsg });

    return new Response(JSON.stringify({
      success: tweetResult.success,
      tweetId: tweetResult.tweetId,
      queueId: tweetId,
      imageUrl: storedImageUrl,
      mediaAssetId,
      mode,
      mediaType: "IMAGE",
      asyncPending: true,
      content: tweetText,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-media-post error:", e);
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
