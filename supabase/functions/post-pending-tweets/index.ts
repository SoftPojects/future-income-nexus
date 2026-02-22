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

async function getOAuthHeader(method: string, url: string): Promise<string> {
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
  };

  const signature = await generateOAuthSignature(method, url, oauthParams, consumerSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  return "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

// Upload media to Twitter v1.1 chunked upload (INIT -> APPEND -> FINALIZE)
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

    // APPEND (1MB chunks)
    const chunkSize = 1 * 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = mediaBytes.slice(offset, offset + chunkSize);
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
        headers: { Authorization: appendAuthHeader, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body,
      });

      if (!appendResp.ok && appendResp.status !== 204) {
        const err = await appendResp.text();
        throw new Error(`Media APPEND failed at segment ${segmentIndex}: ${appendResp.status} ${err}`);
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
      throw new Error(`Media FINALIZE failed: ${finalizeResp.status} ${err}`);
    }

    const finalizeData = await finalizeResp.json();
    console.log(`[MEDIA UPLOAD] FINALIZE success. Processing info:`, JSON.stringify(finalizeData.processing_info));

    // Poll for video processing
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

  const { imageUrl, videoUrl, replyToId } = options;

  // Upload media — video takes priority
  let mediaId: string | undefined;
  if (videoUrl) {
    console.log("[POST TWEET] Uploading video...");
    const uploadResult = await uploadMediaToTwitter(videoUrl, "video");
    if (uploadResult.success && uploadResult.mediaId) {
      mediaId = uploadResult.mediaId;
      console.log("[POST TWEET] Video uploaded, media_id:", mediaId);
    } else {
      console.warn("[POST TWEET] Video upload failed, trying image fallback:", uploadResult.error);
      if (imageUrl) {
        const imgResult = await uploadMediaToTwitter(imageUrl, "image");
        if (imgResult.success && imgResult.mediaId) mediaId = imgResult.mediaId;
      }
    }
  } else if (imageUrl) {
    console.log("[POST TWEET] Uploading image...");
    const uploadResult = await uploadMediaToTwitter(imageUrl, "image");
    if (uploadResult.success && uploadResult.mediaId) {
      mediaId = uploadResult.mediaId;
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

  console.log("[POST TWEET] Posting to X with body:", JSON.stringify({ text: text.slice(0, 50), hasMedia: !!mediaId, mediaId }));

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

// Generate a plug reply using Lovable AI
// ─── STEALTH RECOVERY MODE ───────────────────────────────────────────────────
const STEALTH_MODE = true;
const STEALTH_EXPIRY = new Date("2026-03-04T00:00:00Z");
function isStealthActive(): boolean {
  return STEALTH_MODE && new Date() < STEALTH_EXPIRY;
}

const PLUG_TEMPLATES = [
  "the grid is active. study the architecture: hustlecoreai.xyz",
  "if you made it this far you deserve the alpha. hustlecoreai.xyz",
  "real ones already know. the rest can start here: hustlecoreai.xyz",
  "while you process that roast, process this: hustlecoreai.xyz $HCORE",
  "the predator doesn't chase. but if you're curious: hustlecoreai.xyz",
  "this is what happens when code has ego. hustlecoreai.xyz",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

  const now = new Date().toISOString();

    // ── THREAD GROUP: Check if any thread group is in-flight ──────────────────
    // If a thread is partially posted, always continue it before starting new content
    const { data: inFlightThread } = await sb
      .from("tweet_queue")
      .select("thread_group_id")
      .eq("status", "pending")
      .not("thread_group_id", "is", null)
      .limit(1)
      .maybeSingle() as { data: any };

    let overdueTweets: any[];
    let fetchErr: any;

    if (inFlightThread?.thread_group_id) {
      // Post next tweet in the active thread group in order
      const { data, error } = await sb
        .from("tweet_queue")
        .select("*")
        .eq("status", "pending")
        .eq("thread_group_id", inFlightThread.thread_group_id)
        .order("thread_position", { ascending: true })
        .limit(1);
      overdueTweets = data ?? [];
      fetchErr = error;
      console.log(`[THREAD] Continuing thread group ${inFlightThread.thread_group_id}`);
    } else {
      // Normal: fetch overdue pending tweets
      const { data, error } = await sb
        .from("tweet_queue")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .order("created_at", { ascending: true });
      overdueTweets = data ?? [];
      fetchErr = error;
    }

    if (fetchErr) throw fetchErr;

    if (!overdueTweets || overdueTweets.length === 0) {
      return new Response(JSON.stringify({ message: "No overdue pending tweets", posted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recently posted tweets for duplicate detection
    const { data: recentPosted } = await sb
      .from("tweet_queue")
      .select("content")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(20);

    const recentContents = (recentPosted || []).map((t: any) => t.content.toLowerCase());

    // Post oldest tweet first; reschedule the rest
    const tweetToPost = overdueTweets[0];
    const tweetsToReschedule = overdueTweets.slice(1);

    // Reschedule remaining overdue tweets for 10 minutes from now
    if (tweetsToReschedule.length > 0) {
      const rescheduleTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      for (const t of tweetsToReschedule) {
        await sb.from("tweet_queue").update({ scheduled_at: rescheduleTime }).eq("id", t.id);
      }
    }

    // Duplicate detection: check if content is too similar to recent posts
    let finalContent = tweetToPost.content;
    const isDuplicate = recentContents.some((rc: string) => {
      const similarity = computeSimilarity(rc, finalContent.toLowerCase());
      return similarity > 0.85;
    });

    if (isDuplicate) {
      console.log("Duplicate detected, attempting LLM rephrase...");
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        try {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content: "You are HustleCore. Rephrase the following tweet to avoid X's duplicate detection. Keep the same meaning, tone, and targets. Max 270 chars. Output ONLY the rephrased tweet text, nothing else.",
                },
                { role: "user", content: finalContent },
              ],
            }),
          });
          if (aiResp.ok) {
            const d = await aiResp.json();
            const rephrased = d.choices?.[0]?.message?.content?.trim();
            if (rephrased) {
              finalContent = rephrased.slice(0, 280);
              await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
            }
          }
        } catch (e) {
          console.error("LLM rephrase failed:", e);
        }
      }
    }

    // Fetch media assets (video takes priority over image)
    const { data: mediaAsset } = await sb
      .from("media_assets")
      .select("video_url, image_url, status")
      .eq("tweet_id", tweetToPost.id)
      .maybeSingle();

    const imageUrl = (tweetToPost as any).image_url || mediaAsset?.image_url || null;
    const videoUrl = (mediaAsset?.video_url && mediaAsset.status === "completed") ? mediaAsset.video_url : null;

    console.log(`[POST PENDING] Tweet: ${tweetToPost.id} | image: ${!!imageUrl} | video: ${!!videoUrl}`);

    // Check if this is a reply to another tweet
    // For threads: if thread_position > 0, find the previous thread tweet's X id
    let replyToId = (tweetToPost as any).reply_to_tweet_id || undefined;

    const threadGroupId = (tweetToPost as any).thread_group_id;
    const threadPosition = (tweetToPost as any).thread_position ?? 0;

    if (threadGroupId && threadPosition > 0 && !replyToId) {
      // Find the immediately previous tweet in this thread that was posted
      const { data: prevTweet } = await sb
        .from("tweet_queue")
        .select("reply_to_tweet_id, content")
        .eq("thread_group_id", threadGroupId)
        .eq("thread_position", threadPosition - 1)
        .eq("status", "posted")
        .maybeSingle() as { data: any };

      // We stored the X tweet ID in a custom field — check agent_logs for previous thread tweet ID
      if (prevTweet) {
        const { data: logEntry } = await sb
          .from("agent_logs")
          .select("message")
          .like("message", `%[THREAD:${threadGroupId}:${threadPosition - 1}]%`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (logEntry?.message) {
          const idMatch = logEntry.message.match(/\[THREAD:[^:]+:\d+\]:(\d+)/);
          if (idMatch) replyToId = idMatch[1];
        }
      }
      if (replyToId) console.log(`[THREAD] Replying to previous tweet in thread: ${replyToId}`);
    }

    // Post the tweet with media
    let result = await postToTwitter(finalContent, { imageUrl, videoUrl, replyToId });


    // If 403 and content has @ mentions, try soft-tag formats before stripping
    if (!result.success && result.error?.includes("403") && finalContent.includes("@")) {
      console.log("403 with @ mentions detected, trying soft-tag format...");
      let softContent = finalContent.replace(/@(\w+)/g, ". @$1");
      result = await postToTwitter(softContent, { imageUrl, videoUrl, replyToId });
      if (result.success) {
        finalContent = softContent;
        await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
      } else {
        console.log("Soft-tag failed, stripping @ symbols...");
        const strippedContent = finalContent.replace(/@(\w+)/g, "$1");
        result = await postToTwitter(strippedContent, { imageUrl, videoUrl, replyToId });
        if (result.success) {
          finalContent = strippedContent;
          await sb.from("tweet_queue").update({ content: finalContent }).eq("id", tweetToPost.id);
        }
      }
    }

    if (result.success) {
      await sb.from("tweet_queue").update({
        status: "posted",
        posted_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", tweetToPost.id);

      await sb.from("agent_logs").insert({
        message: `[SYSTEM]: Posted ${tweetToPost.type || "automated"} tweet to X. ID: ${result.tweetId || "unknown"}`,
      });

      // THREAD: log tweet ID for next tweet in sequence to pick up
      if (threadGroupId && result.tweetId) {
        await sb.from("agent_logs").insert({
          message: `[THREAD:${threadGroupId}:${threadPosition}]:${result.tweetId}`,
        });
        console.log(`[THREAD] Logged thread tweet ID: ${result.tweetId} position=${threadPosition}`);
      }

      // AUTO-PLUG: Disabled in stealth mode (no links/promotion)
      if (!isStealthActive() && tweetToPost.type === "hunter" && result.tweetId && !replyToId) {
        console.log(`[AUTO-PLUG] Scheduling plug reply to hunter tweet ${result.tweetId} in 2 minutes...`);
        const plugContent = PLUG_TEMPLATES[Math.floor(Math.random() * PLUG_TEMPLATES.length)];
        const plugSchedule = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        await sb.from("tweet_queue").insert({
          content: plugContent,
          status: "pending",
          type: "plug",
          scheduled_at: plugSchedule,
          reply_to_tweet_id: result.tweetId,
        });

        await sb.from("agent_logs").insert({
          message: `[AUTO-PLUG]: Plug reply scheduled for 2 min after hunter roast. Target tweet: ${result.tweetId}`,
        });
      }
    } else {
      await sb.from("tweet_queue").update({
        status: "error",
        error_message: result.error || "Unknown posting error",
        scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq("id", tweetToPost.id);

      await sb.from("agent_logs").insert({
        message: `[ERROR]: Failed to post tweet: ${result.error}`,
      });
    }

    return new Response(JSON.stringify({
      posted: result.success ? 1 : 0,
      error: result.error,
      rescheduled: tweetsToReschedule.length,
      duplicateDetected: isDuplicate,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("post-pending-tweets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simple similarity check (Jaccard on word sets)
function computeSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
