import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple OAuth 1.0a implementation for Twitter API v2
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
  const sortedParams = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function buildOAuthHeader(method: string, url: string, consumerKey: string, consumerSecret: string, accessToken: string, accessTokenSecret: string): string {
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
  // NOTE: Do NOT include POST body parameters for JSON requests
  return oauthParams as any; // we return the object and build header below
}

async function getOAuthHeader(method: string, url: string, extraParams: Record<string, string> = {}): Promise<string> {
  const consumerKey = Deno.env.get("X_API_KEY")!;
  const consumerSecret = Deno.env.get("X_API_SECRET")!;
  const accessToken = Deno.env.get("X_ACCESS_TOKEN")!;
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET")!;

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };

  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  return "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

// Upload media to Twitter v1.1 INIT + APPEND + FINALIZE (chunked upload)
async function uploadMediaToTwitter(mediaUrl: string, mediaType: "image" | "video"): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    console.log(`[MEDIA UPLOAD] Downloading from: ${mediaUrl}`);
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) throw new Error(`Failed to download media: ${mediaResp.status}`);
    const mediaBuffer = await mediaResp.arrayBuffer();
    const mediaBytes = new Uint8Array(mediaBuffer);
    const totalBytes = mediaBytes.length;
    console.log(`[MEDIA UPLOAD] Downloaded ${totalBytes} bytes`);

    const contentType = mediaType === "video" ? "video/mp4" : "image/jpeg";
    const mediaCategory = mediaType === "video" ? "tweet_video" : "tweet_image";

    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";

    // INIT
    const initParams = new URLSearchParams({
      command: "INIT",
      total_bytes: totalBytes.toString(),
      media_type: contentType,
      media_category: mediaCategory,
    });

    const initAuthHeader = await getOAuthHeader("POST", uploadUrl);
    const initResp = await fetch(`${uploadUrl}?${initParams.toString()}`, {
      method: "POST",
      headers: { Authorization: initAuthHeader },
    });

    if (!initResp.ok) {
      const err = await initResp.text();
      console.error("[MEDIA UPLOAD] INIT failed:", err);
      throw new Error(`Media INIT failed: ${initResp.status} ${err}`);
    }

    const initData = await initResp.json();
    const mediaId = initData.media_id_string;
    console.log(`[MEDIA UPLOAD] INIT success. media_id: ${mediaId}`);

    // APPEND (upload in chunks of 1MB)
    const chunkSize = 1 * 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = mediaBytes.slice(offset, offset + chunkSize);

      // Build multipart form
      const boundary = `----TwitterMediaUpload${Date.now()}`;
      const formParts: Uint8Array[] = [];

      const enc = new TextEncoder();
      formParts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="command"\r\n\r\nAPPEND\r\n`));
      formParts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="media_id"\r\n\r\n${mediaId}\r\n`));
      formParts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n${segmentIndex}\r\n`));
      formParts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="media"\r\nContent-Type: application/octet-stream\r\n\r\n`));
      formParts.push(chunk);
      formParts.push(enc.encode(`\r\n--${boundary}--\r\n`));

      const totalLength = formParts.reduce((s, p) => s + p.length, 0);
      const body = new Uint8Array(totalLength);
      let pos = 0;
      for (const part of formParts) { body.set(part, pos); pos += part.length; }

      const appendAuthHeader = await getOAuthHeader("POST", uploadUrl);
      const appendResp = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: appendAuthHeader,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      if (!appendResp.ok && appendResp.status !== 204) {
        const err = await appendResp.text();
        console.error(`[MEDIA UPLOAD] APPEND chunk ${segmentIndex} failed:`, err);
        throw new Error(`Media APPEND failed at segment ${segmentIndex}: ${appendResp.status}`);
      }
      console.log(`[MEDIA UPLOAD] APPEND chunk ${segmentIndex} OK`);
      segmentIndex++;
    }

    // FINALIZE
    const finalizeParams = new URLSearchParams({ command: "FINALIZE", media_id: mediaId });
    const finalizeAuthHeader = await getOAuthHeader("POST", uploadUrl);
    const finalizeResp = await fetch(`${uploadUrl}?${finalizeParams.toString()}`, {
      method: "POST",
      headers: { Authorization: finalizeAuthHeader },
    });

    if (!finalizeResp.ok) {
      const err = await finalizeResp.text();
      console.error("[MEDIA UPLOAD] FINALIZE failed:", err);
      throw new Error(`Media FINALIZE failed: ${finalizeResp.status} ${err}`);
    }

    const finalizeData = await finalizeResp.json();
    console.log(`[MEDIA UPLOAD] FINALIZE success. Processing info:`, JSON.stringify(finalizeData.processing_info));

    // If video: poll for processing_info.state === "succeeded"
    if (mediaType === "video" && finalizeData.processing_info) {
      let state = finalizeData.processing_info.state;
      let attempts = 0;
      while (state === "pending" || state === "in_progress") {
        if (attempts++ > 30) throw new Error("Media processing timed out");
        const waitMs = (finalizeData.processing_info.check_after_secs || 5) * 1000;
        console.log(`[MEDIA UPLOAD] Video processing state: ${state}, waiting ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));

        const statusAuthHeader = await getOAuthHeader("GET", uploadUrl);
        const statusResp = await fetch(`${uploadUrl}?command=STATUS&media_id=${mediaId}`, {
          headers: { Authorization: statusAuthHeader },
        });
        const statusData = await statusResp.json();
        state = statusData.processing_info?.state;
        console.log(`[MEDIA UPLOAD] Video processing state now: ${state}`);
        if (state === "failed") throw new Error("Video processing failed: " + JSON.stringify(statusData.processing_info?.error));
      }
      console.log("[MEDIA UPLOAD] Video processing succeeded!");
    }

    return { success: true, mediaId };
  } catch (e) {
    console.error("[MEDIA UPLOAD] Error:", e);
    return { success: false, error: e instanceof Error ? e.message : "Unknown media upload error" };
  }
}

async function postToTwitter(
  text: string,
  options: { replyToId?: string; imageUrl?: string | null; videoUrl?: string | null } = {}
): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const consumerKey = Deno.env.get("X_API_KEY");
  const consumerSecret = Deno.env.get("X_API_SECRET");
  const accessToken = Deno.env.get("X_ACCESS_TOKEN");
  const accessTokenSecret = Deno.env.get("X_ACCESS_SECRET");

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { success: false, error: "X API credentials not configured" };
  }

  // Upload media if present (video takes priority over image)
  let mediaId: string | undefined;
  const { imageUrl, videoUrl, replyToId } = options;

  if (videoUrl) {
    console.log("[POST TWEET] Uploading video...");
    const uploadResult = await uploadMediaToTwitter(videoUrl, "video");
    if (uploadResult.success && uploadResult.mediaId) {
      mediaId = uploadResult.mediaId;
      console.log("[POST TWEET] Video uploaded, media_id:", mediaId);
    } else {
      console.warn("[POST TWEET] Video upload failed, falling back to image or text-only:", uploadResult.error);
      // Try image fallback
      if (imageUrl) {
        const imgResult = await uploadMediaToTwitter(imageUrl, "image");
        if (imgResult.success && imgResult.mediaId) {
          mediaId = imgResult.mediaId;
          console.log("[POST TWEET] Image fallback uploaded, media_id:", mediaId);
        }
      }
    }
  } else if (imageUrl) {
    console.log("[POST TWEET] Uploading image...");
    const uploadResult = await uploadMediaToTwitter(imageUrl, "image");
    if (uploadResult.success && uploadResult.mediaId) {
      mediaId = uploadResult.mediaId;
      console.log("[POST TWEET] Image uploaded, media_id:", mediaId);
    } else {
      console.warn("[POST TWEET] Image upload failed, posting text-only:", uploadResult.error);
    }
  }

  const url = "https://api.x.com/2/tweets";
  const method = "POST";
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

  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const authHeader = "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");

  const body: any = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };
  if (mediaId) body.media = { media_ids: [mediaId] };

  console.log("[POST TWEET] Posting to X with body:", JSON.stringify({ text: text.slice(0, 50), hasMedia: !!mediaId }));

  const resp = await fetch(url, {
    method,
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("Twitter API error:", resp.status, JSON.stringify(data));
    return { success: false, error: `${resp.status}: ${data.detail || data.title || JSON.stringify(data)}` };
  }

  return { success: true, tweetId: data.data?.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Health check endpoint
    if (body.healthCheck) {
      const hasKeys = !!(Deno.env.get("X_API_KEY") && Deno.env.get("X_API_SECRET") && Deno.env.get("X_ACCESS_TOKEN") && Deno.env.get("X_ACCESS_SECRET"));
      return new Response(
        JSON.stringify({ status: hasKeys ? "connected" : "missing_keys" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Direct post mode — used by donation tweets for instant posting (text only)
    if (body.directPost && typeof body.directPost === "string") {
      const result = await postToTwitter(body.directPost);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Post a specific tweet by ID (POST NOW button)
    if (body.tweetId) {
      const { data: tweet, error } = await sb
        .from("tweet_queue")
        .select("*")
        .eq("id", body.tweetId)
        .eq("status", "pending")
        .single();

      if (error || !tweet) {
        return new Response(
          JSON.stringify({ error: "Tweet not found or already posted" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Look up media_assets for this tweet (video takes priority)
      const { data: mediaAsset } = await sb
        .from("media_assets")
        .select("video_url, audio_url, image_url, status")
        .eq("tweet_id", body.tweetId)
        .maybeSingle();

      const imageUrl = tweet.image_url || mediaAsset?.image_url || null;
      const videoUrl = (mediaAsset?.video_url && mediaAsset.status === "completed") ? mediaAsset.video_url : null;

      console.log(`[POST NOW] Tweet: ${body.tweetId} | image: ${!!imageUrl} | video: ${!!videoUrl}`);

      let result = await postToTwitter(tweet.content, { imageUrl, videoUrl, replyToId: tweet.reply_to_tweet_id });

      // Retry on 403 with @ mentions stripped
      if (!result.success && result.error?.includes("403") && tweet.content.includes("@")) {
        const stripped = tweet.content.replace(/@(\w+)/g, "$1");
        result = await postToTwitter(stripped, { imageUrl, videoUrl, replyToId: tweet.reply_to_tweet_id });
        if (result.success) {
          await sb.from("tweet_queue").update({ content: stripped }).eq("id", tweet.id);
        }
      }

      if (result.success) {
        await sb.from("tweet_queue").update({
          status: "posted",
          posted_at: new Date().toISOString(),
          error_message: null,
        }).eq("id", tweet.id);

        await sb.from("agent_logs").insert({
          message: `[SYSTEM]: Manual POST NOW: tweet posted to X with${videoUrl ? " video" : imageUrl ? " image" : "out media"}. ID: ${result.tweetId}`,
        });
      } else {
        await sb.from("tweet_queue").update({ status: "error", error_message: result.error || "Unknown error" }).eq("id", tweet.id);
        await sb.from("agent_logs").insert({
          message: `[ERROR]: POST NOW failed: ${result.error}`,
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Post next pending tweet (autonomous mode)
    const { data: nextTweet } = await sb
      .from("tweet_queue")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .single();

    if (!nextTweet) {
      return new Response(JSON.stringify({ message: "No pending tweets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up media_assets for this tweet
    const { data: nextMediaAsset } = await sb
      .from("media_assets")
      .select("video_url, audio_url, image_url, status")
      .eq("tweet_id", nextTweet.id)
      .maybeSingle();

    const nextImageUrl = nextTweet.image_url || nextMediaAsset?.image_url || null;
    const nextVideoUrl = (nextMediaAsset?.video_url && nextMediaAsset.status === "completed") ? nextMediaAsset.video_url : null;

    let result = await postToTwitter(nextTweet.content, { imageUrl: nextImageUrl, videoUrl: nextVideoUrl, replyToId: nextTweet.reply_to_tweet_id });

    if (!result.success && result.error?.includes("403") && nextTweet.content.includes("@")) {
      const stripped = nextTweet.content.replace(/@(\w+)/g, "$1");
      result = await postToTwitter(stripped, { imageUrl: nextImageUrl, videoUrl: nextVideoUrl, replyToId: nextTweet.reply_to_tweet_id });
      if (result.success) {
        await sb.from("tweet_queue").update({ content: stripped }).eq("id", nextTweet.id);
      }
    }

    if (result.success) {
      await sb.from("tweet_queue").update({ status: "posted", posted_at: new Date().toISOString(), error_message: null }).eq("id", nextTweet.id);
    } else {
      await sb.from("tweet_queue").update({ status: "error", error_message: result.error || "Unknown error" }).eq("id", nextTweet.id);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
