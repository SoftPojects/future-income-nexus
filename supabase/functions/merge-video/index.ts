import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Production Shotstack API endpoint
const SHOTSTACK_API_URL = "https://api.shotstack.io/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
    if (!SHOTSTACK_API_KEY) throw new Error("SHOTSTACK_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { imageUrl, audioUrl, tweetId } = body;

    if (!imageUrl) throw new Error("imageUrl required");
    if (!audioUrl) throw new Error("audioUrl required");

    console.log(`[VIDEO] Merging Neural Intercept for tweet ${tweetId || "unknown"}...`);
    console.log(`[VIDEO] Image: ${imageUrl}`);
    console.log(`[VIDEO] Audio: ${audioUrl}`);

    // Shotstack timeline: Image fills 1024x1024, dynamic effects, auto-length from audio
    const timeline = {
      background: "#000000",
      tracks: [
        {
          // Track 1 (top): Neon cyan audiogram bar overlay at bottom
          clips: [
            {
              asset: {
                type: "html",
                html: `<div style="width:1024px;height:80px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);"><div style="width:85%;height:6px;background:linear-gradient(90deg,transparent 0%,#00FFFF 15%,#00E5FF 30%,#FF00FF 50%,#00E5FF 70%,#00FFFF 85%,transparent 100%);border-radius:3px;box-shadow:0 0 15px #00FFFF,0 0 30px rgba(0,255,255,0.5),0 0 60px rgba(0,255,255,0.2);"></div></div>`,
                width: 1024,
                height: 80,
              },
              start: 0,
              length: "auto",
              position: "bottom",
              offset: { y: 0.02 },
            },
          ],
        },
        {
          // Track 2 (middle): Subtle glitch/scanline overlay for dynamic feel
          clips: [
            {
              asset: {
                type: "html",
                html: `<div style="width:1024px;height:1024px;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,255,0.03) 3px,rgba(0,255,255,0.03) 4px);mix-blend-mode:overlay;"></div>`,
                width: 1024,
                height: 1024,
              },
              start: 0,
              length: "auto",
              opacity: 0.6,
            },
          ],
        },
        {
          // Track 3: Main headline card image — fills entire frame with slow zoom
          clips: [
            {
              asset: {
                type: "image",
                src: imageUrl,
              },
              start: 0,
              length: "auto",
              fit: "cover",
              effect: "zoomInSlow",
              transition: {
                in: "fade",
                out: "fade",
              },
            },
          ],
        },
      ],
      soundtrack: {
        src: audioUrl,
        effect: "fadeOut",
      },
    };

    const output = {
      format: "mp4",
      resolution: "sd",
      size: {
        width: 1024,
        height: 1024,
      },
      fps: 25,
    };

    // Submit render to Shotstack PRODUCTION
    console.log(`[VIDEO] Submitting to Shotstack Production...`);
    const renderResp = await fetch(`${SHOTSTACK_API_URL}/render`, {
      method: "POST",
      headers: {
        "x-api-key": SHOTSTACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeline, output }),
    });

    if (!renderResp.ok) {
      const errText = await renderResp.text();
      const status = renderResp.status;
      // Log specific errors for admin monitoring
      if (status === 403 || status === 402) {
        await sb.from("agent_logs").insert({
          message: `[VIDEO MERGE]: ⚠️ Shotstack ${status === 403 ? "access denied" : "credit limit"} error. Check API key or billing. Details: ${errText.slice(0, 200)}`,
        });
      }
      throw new Error(`Shotstack render failed: ${status} ${errText}`);
    }

    const renderData = await renderResp.json();
    const renderId = renderData.response?.id;
    if (!renderId) throw new Error("No render ID returned from Shotstack");

    console.log(`[VIDEO] Shotstack render submitted: ${renderId}`);
    await sb.from("agent_logs").insert({
      message: `[VIDEO MERGE]: Render submitted to Shotstack Production. ID: ${renderId}`,
    });

    // Poll for completion (max 180s at 5s intervals)
    let videoUrl: string | null = null;
    for (let attempt = 0; attempt < 36; attempt++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResp = await fetch(`${SHOTSTACK_API_URL}/render/${renderId}`, {
        headers: { "x-api-key": SHOTSTACK_API_KEY },
      });

      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      const status = statusData.response?.status;
      console.log(`[VIDEO] Poll ${attempt + 1}: status=${status}`);

      if (status === "done") {
        videoUrl = statusData.response?.url;
        break;
      } else if (status === "failed") {
        const errDetail = JSON.stringify(statusData.response?.error || statusData.response);
        await sb.from("agent_logs").insert({
          message: `[VIDEO MERGE]: ❌ Shotstack render FAILED. ID: ${renderId}. Error: ${errDetail.slice(0, 300)}`,
        });
        throw new Error(`Shotstack render failed: ${errDetail}`);
      }
    }

    if (!videoUrl) throw new Error("Shotstack render timed out after 180s");

    console.log(`[VIDEO] Render complete: ${videoUrl}`);

    // Download and store in media-assets bucket
    const videoResp = await fetch(videoUrl);
    const videoBuffer = await videoResp.arrayBuffer();
    const ts = Date.now();
    const videoPath = `videos/${ts}.mp4`;

    await sb.storage.from("media-assets").upload(videoPath, new Uint8Array(videoBuffer), {
      contentType: "video/mp4",
      upsert: true,
    });

    const { data: urlData } = sb.storage.from("media-assets").getPublicUrl(videoPath);
    const storedVideoUrl = urlData.publicUrl;

    await sb.from("agent_logs").insert({
      message: `[VIDEO MERGE]: ✅ Neural Intercept rendered. ID: ${renderId}. Stored: ${videoPath}`,
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

    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("agent_logs").insert({
        message: `[VIDEO MERGE]: ❌ Error: ${e instanceof Error ? e.message : "Unknown"}`,
      });
    } catch {}

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
