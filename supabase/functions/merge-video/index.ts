import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
    if (!SHOTSTACK_API_KEY) throw new Error("SHOTSTACK_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { imageUrl, audioUrl, tweetId, headlineText } = body;

    if (!imageUrl) throw new Error("imageUrl required");
    if (!audioUrl) throw new Error("audioUrl required");

    console.log(`[VIDEO] Merging video for tweet ${tweetId || "unknown"}...`);

    // Build Shotstack timeline: image background + audio + waveform overlay
    const timeline = {
      soundtrack: {
        src: audioUrl,
        effect: "fadeOut",
      },
      background: "#000000",
      tracks: [
        {
          // Neon cyan audiogram waveform overlay
          clips: [
            {
              asset: {
                type: "audio",
                src: audioUrl,
                effect: "fadeOut",
              },
              start: 0,
              length: "auto",
            },
          ],
        },
        {
          // Main headline card image
          clips: [
            {
              asset: {
                type: "image",
                src: imageUrl,
              },
              start: 0,
              length: "auto",
              fit: "cover",
              effect: "zoomIn",
              transition: {
                in: "fade",
                out: "fade",
              },
            },
          ],
        },
        {
          // Pulsating neon waveform bar at bottom
          clips: [
            {
              asset: {
                type: "html",
                html: `<div style="width:100%;height:60px;display:flex;align-items:center;justify-content:center;"><div style="width:80%;height:4px;background:linear-gradient(90deg,transparent,#00FFFF,#FF00FF,#00FFFF,transparent);border-radius:2px;box-shadow:0 0 20px #00FFFF,0 0 40px #00FFFF;animation:pulse 1s ease-in-out infinite;"></div></div>`,
                width: 1024,
                height: 60,
              },
              start: 0,
              length: "auto",
              position: "bottom",
              offset: {
                y: -0.05,
              },
            },
          ],
        },
      ],
    };

    const output = {
      format: "mp4",
      resolution: "hd",
      aspectRatio: "16:9",
      fps: 25,
    };

    // Submit render to Shotstack
    const renderResp = await fetch("https://api.shotstack.io/edit/v1/render", {
      method: "POST",
      headers: {
        "x-api-key": SHOTSTACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeline, output }),
    });

    if (!renderResp.ok) {
      const errText = await renderResp.text();
      throw new Error(`Shotstack render submit failed: ${renderResp.status} ${errText}`);
    }

    const renderData = await renderResp.json();
    const renderId = renderData.response?.id;
    if (!renderId) throw new Error("No render ID returned from Shotstack");

    console.log(`[VIDEO] Shotstack render submitted: ${renderId}`);

    // Poll for completion (max 120s)
    let videoUrl: string | null = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      await new Promise(r => setTimeout(r, 5000)); // 5s intervals

      const statusResp = await fetch(`https://api.shotstack.io/edit/v1/render/${renderId}`, {
        headers: { "x-api-key": SHOTSTACK_API_KEY },
      });

      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      const status = statusData.response?.status;

      if (status === "done") {
        videoUrl = statusData.response?.url;
        break;
      } else if (status === "failed") {
        throw new Error(`Shotstack render failed: ${JSON.stringify(statusData.response?.error)}`);
      }
      // else: queued, fetching, rendering — keep polling
    }

    if (!videoUrl) throw new Error("Shotstack render timed out after 120s");

    console.log(`[VIDEO] Render complete: ${videoUrl}`);

    // Download and store in media-assets bucket
    const videoResp = await fetch(videoUrl);
    const videoBuffer = await videoResp.arrayBuffer();
    const ts = Date.now();
    const videoPath = `videos/${ts}-${(tweetId || "unknown").slice(0, 8)}.mp4`;

    await sb.storage.from("media-assets").upload(videoPath, new Uint8Array(videoBuffer), {
      contentType: "video/mp4",
      upsert: true,
    });

    const { data: urlData } = sb.storage.from("media-assets").getPublicUrl(videoPath);
    const storedVideoUrl = urlData.publicUrl;

    // Update tweet_queue if tweetId provided
    if (tweetId) {
      await sb.from("tweet_queue").update({ video_url: storedVideoUrl }).eq("id", tweetId);
    }

    await sb.from("agent_logs").insert({
      message: `[VIDEO MERGE]: Neural Intercept video rendered. ID: ${renderId}`,
    });

    return new Response(JSON.stringify({
      success: true,
      videoUrl: storedVideoUrl,
      renderId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("merge-video error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
