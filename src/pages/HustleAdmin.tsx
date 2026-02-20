import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Send, RefreshCw, Trash2, Edit2, Zap, Twitter, Clock, CheckCircle, AlertCircle, Power, Crosshair, Plus, Lightbulb, Copy, ArrowRight, ChevronDown, ChevronUp, Loader2, Activity, Eye, Film, X, Download, RotateCcw, Play, Pause, Image as ImageIcon, Volume2, Video, TrendingUp, Radio, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTotalSolDonated } from "@/hooks/useTotalSolDonated";

// ─── Neural Guide Tooltip ───
const NeuralTooltip = ({ content, children }: { content: string; children: React.ReactNode }) => (
  <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent
      className="max-w-xs bg-[hsl(220_20%_8%)] border border-[hsl(180_100%_50%/0.4)] text-[hsl(180_100%_85%)] text-[10px] font-mono leading-relaxed shadow-[0_0_16px_hsl(180_100%_50%/0.15)] px-3 py-2"
      sideOffset={6}
    >
      <p>{content}</p>
    </TooltipContent>
  </Tooltip>
);

interface TweetQueueItem {
  id: string;
  content: string;
  status: string;
  scheduled_at: string;
  type: string;
  created_at: string;
  posted_at: string | null;
  error_message?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}

interface MediaAsset {
  id: string;
  tweet_id: string | null;
  image_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface XMention {
  id: string;
  author_handle: string;
  content: string;
  replied: boolean;
  created_at: string;
}

interface TargetAgent {
  id: string;
  x_handle: string;
  last_roasted_at: string | null;
  is_active: boolean;
  auto_follow: boolean;
  followed_at: string | null;
  created_at: string;
  source?: string;
  priority?: number;
}

interface SocialLog {
  id: string;
  target_handle: string;
  action_type: string;
  source: string;
  created_at: string;
}

// ─── TIMEZONE-AWARE SCHEDULE LABELS ───
function getScheduleLabel(scheduledAt: string, type: string): { label: string; isPrime: boolean } {
  if (type === "breaking") return { label: "🚨 BREAKING NEWS", isPrime: true };
  if (type === "premium") return { label: "🎬 PREMIUM ENTITY POST", isPrime: true };
  if (type === "whale_tribute") return { label: "🐋 WHALE TRIBUTE", isPrime: true };
  if (type === "manual") return { label: "MANUAL POST", isPrime: false };
  if (type === "trend") return { label: "TREND INTEL", isPrime: false };
  if (type === "grid_observer") return { label: "📡 GRID OBSERVER", isPrime: false };

  const date = new Date(scheduledAt);
  const utcH = date.getUTCHours();
  const utcM = date.getUTCMinutes();
  const totalMin = utcH * 60 + utcM;

  if (totalMin >= 14 * 60 && totalMin < 15 * 60) return { label: "TARGETING: US MORNING PEAK", isPrime: true };
  if (totalMin >= 17 * 60 && totalMin < 18 * 60 + 30) return { label: "TARGETING: US LUNCH PEAK", isPrime: true };
  if (totalMin >= 20 * 60 && totalMin < 21 * 60 + 30) return { label: "TARGETING: US AFTERNOON PEAK", isPrime: true };
  return { label: "OFF-PEAK FILLER", isPrime: false };
}

function getNextScheduledPost(): Date {
  const now = new Date();
  const hours = now.getUTCHours();
  const nextSlot = Math.ceil((hours + 1) / 4) * 4;
  const next = new Date(now);
  next.setUTCHours(nextSlot >= 24 ? nextSlot - 24 : nextSlot, 0, 0, 0);
  if (nextSlot >= 24) next.setUTCDate(next.getUTCDate() + 1);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 4);
  return next;
}

function useCountdown(target: Date) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("POSTING NOW..."); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return timeLeft;
}

// ─── Media Badge Component ───
const MediaBadge = ({ type, ready }: { type: "img" | "voice" | "video"; ready: boolean }) => {
  const config = {
    img: { icon: ImageIcon, label: "IMG", colorReady: "bg-neon-green/15 text-neon-green border-neon-green/30", colorPending: "bg-muted text-muted-foreground border-border" },
    voice: { icon: Volume2, label: "VOICE", colorReady: "bg-neon-magenta/15 text-neon-magenta border-neon-magenta/30", colorPending: "bg-muted text-muted-foreground border-border" },
    video: { icon: Video, label: "VIDEO", colorReady: "bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30", colorPending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  };
  const c = config[type];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${ready ? c.colorReady : c.colorPending}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
};

const HustleAdmin = () => {
  const { toast } = useToast();
  const { totalSol } = useTotalSolDonated();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [tweets, setTweets] = useState<TweetQueueItem[]>([]);
  const [mediaAssets, setMediaAssets] = useState<Record<string, MediaAsset>>({});
  const [mentions, setMentions] = useState<XMention[]>([]);
  const [manualTweet, setManualTweet] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "connected" | "error">("unknown");
  const [mediaStatus, setMediaStatus] = useState<"ready" | "rendering" | "error">("ready");
  const [syncing, setSyncing] = useState(false);
  const [autopilot, setAutopilot] = useState(true);

  // Hunter state
  const [targets, setTargets] = useState<TargetAgent[]>([]);
  const [newHandle, setNewHandle] = useState("");
  const [addingTarget, setAddingTarget] = useState(false);
  const [roastingId, setRoastingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { content: string; angle: string; model: string }[]>>({});
  const [expandedDrafts, setExpandedDrafts] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("queue");
  const [loginLoading, setLoginLoading] = useState(false);
  const nextPost = getNextScheduledPost();
  const countdown = useCountdown(nextPost);

  // Social activity state
  const [socialLogs, setSocialLogs] = useState<SocialLog[]>([]);
  const [nextTargets, setNextTargets] = useState<TargetAgent[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryLog, setDiscoveryLog] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [recentExecCount, setRecentExecCount] = useState(0);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [editingHandle, setEditingHandle] = useState("");
  const [dailyQuota, setDailyQuota] = useState<{ follows_count: number; likes_count: number; follows_limit: number; likes_limit: number } | null>(null);
  const [pulseRunning, setPulseRunning] = useState(false);
  const [injectingMedia, setInjectingMedia] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Watchdog state
  const [watchdogTrending, setWatchdogTrending] = useState<any[]>([]);
  const [watchdogLoading, setWatchdogLoading] = useState(false);
  const [watchdogRunning, setWatchdogRunning] = useState(false);
  const [watchdogLastResult, setWatchdogLastResult] = useState<any | null>(null);
  const [watchdogTargetLog, setWatchdogTargetLog] = useState<string | null>(null);

  // Token Override state
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overridePrice, setOverridePrice] = useState("0.00000529");
  const [overrideChangeH24, setOverrideChangeH24] = useState("20.13");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideLoaded, setOverrideLoaded] = useState(false);

  // VIP Sniper state
  const [vipTargets, setVipTargets] = useState<any[]>([]);
  const [vipReplyLogs, setVipReplyLogs] = useState<any[]>([]);
  const [snipeRunning, setSnipeRunning] = useState(false);
  const [snipeDryRunning, setSnipeDryRunning] = useState(false);
  const [snipeLastResult, setSnipeLastResult] = useState<any | null>(null);
  const [sniperMode, setSniperMode] = useState(true);
  const [sniperModeLoading, setSniperModeLoading] = useState(false);


  const getAdminHeaders = () => {
    const token = sessionStorage.getItem("admin_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const getAdminToken = () => sessionStorage.getItem("admin_token") || "";

  const fetchTweets = useCallback(async () => {
    const { data } = await supabase.from("tweet_queue").select("*").order("scheduled_at", { ascending: true });
    if (data) setTweets(data);
  }, []);

  const fetchMediaAssets = useCallback(async () => {
    const { data } = await supabase.from("media_assets").select("*").order("created_at", { ascending: false });
    if (data) {
      const map: Record<string, MediaAsset> = {};
      data.forEach((a: any) => { if (a.tweet_id) map[a.tweet_id] = a; });
      setMediaAssets(map);
    }
  }, []);

  const fetchMentions = useCallback(async () => {
    const { data } = await supabase.from("x_mentions").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) setMentions(data);
  }, []);

  const fetchTargets = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("admin-hunter", { body: { action: "list", admin_token: getAdminToken() } });
    if (!error && data?.targets) setTargets(data.targets);
  }, []);

  const fetchSocialLogs = useCallback(async () => {
    const { data } = await supabase.from("social_logs").select("*").order("created_at", { ascending: false }).limit(40);
    if (data) setSocialLogs(data);
  }, []);

  const fetchNextTargets = useCallback(async () => {
    const { data } = await supabase.from("target_agents").select("*").eq("auto_follow", true).eq("is_active", true).is("followed_at", null).order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(5);
    if (data) setNextTargets(data);
  }, []);

  const fetchExecCount = useCallback(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("social_logs").select("*", { count: "exact", head: true }).gte("created_at", oneHourAgo).eq("source", "manual_exec");
    setRecentExecCount(count || 0);
  }, []);

  const fetchDailyQuota = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("daily_social_quota" as any).select("*").eq("date", today).maybeSingle();
    if (data) setDailyQuota(data as any);
  }, []);

  const fetchVipTargets = useCallback(async () => {
    const { data } = await supabase.from("vip_targets" as any).select("*").order("display_name", { ascending: true });
    if (data) setVipTargets(data as any[]);
  }, []);

  const fetchVipReplyLogs = useCallback(async () => {
    const { data } = await supabase.from("vip_reply_logs" as any).select("*").order("created_at", { ascending: false }).limit(20);
    if (data) setVipReplyLogs(data as any[]);
  }, []);

  // ─── TOKEN OVERRIDE LOAD ───
  const loadTokenOverride = useCallback(async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["token_override_enabled", "token_override_price", "token_override_change_h24"]);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value; });
      setOverrideEnabled(map["token_override_enabled"] === "true");
      if (map["token_override_price"]) setOverridePrice(map["token_override_price"]);
      if (map["token_override_change_h24"]) setOverrideChangeH24(map["token_override_change_h24"]);
    }
    setOverrideLoaded(true);
  }, []);

  const saveTokenOverride = async () => {
    setOverrideSaving(true);
    try {
      const rows = [
        { key: "token_override_enabled", value: overrideEnabled ? "true" : "false" },
        { key: "token_override_price", value: overridePrice },
        { key: "token_override_change_h24", value: overrideChangeH24 },
      ];
      for (const row of rows) {
        await supabase.from("system_settings").upsert(row, { onConflict: "key" });
      }
      toast({ title: "Token Override Saved", description: overrideEnabled ? `Price: $${overridePrice} | 24h: ${overrideChangeH24}%` : "Override disabled — live DexScreener data will be used." });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setOverrideSaving(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchTweets();
      fetchMediaAssets();
      fetchMentions();
      fetchTargets();
      fetchSocialLogs();
      fetchNextTargets();
      fetchExecCount();
      fetchDailyQuota();
      fetchVipTargets();
      fetchVipReplyLogs();
      loadTokenOverride();

      // Realtime for media_assets + social_logs + daily quota + vip_reply_logs
      const channel = supabase
        .channel("admin-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "media_assets" }, () => fetchMediaAssets())
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_logs" }, () => { fetchSocialLogs(); fetchDailyQuota(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "daily_social_quota" }, () => fetchDailyQuota())
        .on("postgres_changes", { event: "*", schema: "public", table: "vip_reply_logs" }, () => { fetchVipReplyLogs(); fetchVipTargets(); })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [authenticated, fetchTweets, fetchMediaAssets, fetchMentions, fetchTargets, fetchSocialLogs, fetchNextTargets, fetchExecCount, fetchDailyQuota, fetchVipTargets, fetchVipReplyLogs, loadTokenOverride]);

  // ─── VIP SNIPER HANDLERS ───
  const handleFlashSnipe = async (dryRun = false, targetHandle?: string) => {
    if (dryRun) setSnipeDryRunning(true);
    else setSnipeRunning(true);
    setSnipeLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("flash-snipe", {
        body: { dryRun, ...(targetHandle ? { targetHandle } : {}) },
      });
      if (error) throw error;
      setSnipeLastResult(data);
      const fired = data?.fired || 0;
      const status = data?.status || "";
      toast({
        title: dryRun ? "⚡ DRY-RUN COMPLETE" : fired > 0 ? `⚡ VIP INTERCEPTED` : "⚡ SNIPER SCANNED",
        description: dryRun
          ? `Preview generated for @${data?.handle}. No tweet posted.`
          : fired > 0
            ? `Viral intercept deployed on @${data?.handle}.`
            : status === "rate_limited"
              ? `@${data?.handle} already intercepted today.`
              : status === "no_new_tweet"
                ? `No new tweet from @${data?.handle}.`
                : "Scan complete.",
      });
      fetchVipTargets();
      fetchVipReplyLogs();
    } catch (e) {
      toast({ title: "SNIPE FAILED", description: String(e), variant: "destructive" });
    } finally {
      setSnipeRunning(false);
      setSnipeDryRunning(false);
    }
  };

  const handleSniperModeToggle = async (enabled: boolean) => {
    setSniperModeLoading(true);
    try {
      await supabase.functions.invoke("manage-agent", {
        body: {
          action: "set_setting",
          key: "sniper_mode",
          value: enabled ? "true" : "false",
          admin_token: sessionStorage.getItem("admin_token"),
        },
      });
      // Optimistic update — we directly write via supabase client using service key is not possible from FE
      // so we use manage-agent. If that fails, fall back to just visual update.
      setSniperMode(enabled);
      toast({
        title: enabled ? "🎯 SNIPER MODE ACTIVATED" : "⏸ SNIPER MODE PAUSED",
        description: enabled ? "VIP monitoring is live." : "VIP auto-replies suspended.",
      });
    } catch {
      setSniperMode(enabled); // optimistic anyway
    } finally {
      setSniperModeLoading(false); }
  };


  // ─── AUTH ───
  const handleLogin = async () => {
    if (!password.trim() || loginLoading) return;
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-auth", { body: { password } });
      if (error || !data?.success) {
        toast({ title: "ACCESS DENIED", description: data?.error || "Wrong password, human.", variant: "destructive" });
      } else {
        sessionStorage.setItem("admin_token", data.token);
        setAuthenticated(true);
      }
    } catch {
      toast({ title: "ACCESS DENIED", description: "Authentication failed.", variant: "destructive" });
    } finally { setLoginLoading(false); setPassword(""); }
  };

  // ─── TWEET ACTIONS ───
  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tweet", { headers: getAdminHeaders() });
      if (error) throw error;
      toast({ title: "TWEET GENERATED", description: data?.content?.slice(0, 60) + "..." });
      fetchTweets();
    } catch (e) { toast({ title: "Generation failed", description: String(e), variant: "destructive" }); }
    finally { setGenerating(false); }
  };

  const handleBatchPreGenerate = async () => {
    setBatchGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-post", { body: { batchPreGenerate: true } });
      if (error) throw error;
      toast({ title: "BATCH GENERATED", description: `${data?.generated || 0} tweets pre-generated.` });
      fetchTweets();
    } catch (e) { toast({ title: "Batch failed", description: String(e), variant: "destructive" }); }
    finally { setBatchGenerating(false); }
  };

  const handleInjectMedia = async () => {
    const targetTweets = tweets.filter((t) => t.status === "pending").filter((t) => {
      const { label } = getScheduleLabel(t.scheduled_at, t.type);
      return label.includes("US MORNING PEAK") || label.includes("US LUNCH PEAK");
    });
    if (!targetTweets.length) {
      toast({ title: "NO TARGETS", description: "No US Morning/Lunch peak tweets found.", variant: "destructive" });
      return;
    }
    setInjectingMedia(true);
    setMediaStatus("rendering");
    try {
      const { data, error } = await supabase.functions.invoke("inject-media", { body: { tweetIds: targetTweets.map((t) => t.id), voiceMode: "paid" } });
      if (error) throw error;
      toast({ title: "MEDIA INJECTED", description: `${data?.results?.filter((r: any) => r.image_url)?.length || 0} enriched.` });
      setMediaStatus("ready");
      fetchTweets();
    } catch (e) { setMediaStatus("error"); toast({ title: "Media injection failed", description: String(e), variant: "destructive" }); }
    finally { setInjectingMedia(false); }
  };

  const handleManualPost = async () => {
    if (!manualTweet.trim()) return;
    setPosting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-tweet-actions", { body: { action: "insert", content: manualTweet.trim(), type: "manual" }, headers: getAdminHeaders() });
      if (error) throw error;
      setManualTweet("");
      toast({ title: "QUEUED", description: "Manual tweet added." });
      fetchTweets();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
    finally { setPosting(false); }
  };

  const handlePostNow = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("post-tweet", { body: { tweetId: id }, headers: getAdminHeaders() });
      if (error) throw error;
      toast({ title: "POSTED" });
      fetchTweets();
    } catch (e) { toast({ title: "Post failed", description: String(e), variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    await supabase.functions.invoke("admin-tweet-actions", { body: { action: "delete", id }, headers: getAdminHeaders() });
    fetchTweets();
  };

  const handleEdit = (tweet: TweetQueueItem) => { setEditingId(tweet.id); setEditContent(tweet.content); };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.functions.invoke("admin-tweet-actions", { body: { action: "update", id: editingId, content: editContent }, headers: getAdminHeaders() });
    setEditingId(null); setEditContent("");
    fetchTweets();
  };

  const checkApiStatus = async () => {
    try {
      const { error } = await supabase.functions.invoke("post-tweet", { body: { healthCheck: true } });
      setApiStatus(error ? "error" : "connected");
    } catch { setApiStatus("error"); }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-pending-tweets", { body: {} });
      if (error) throw error;
      toast({ title: "FORCE SYNC COMPLETE", description: `Posted: ${data?.posted || 0}` });
      fetchTweets();
    } catch (e) { toast({ title: "Sync failed", description: String(e), variant: "destructive" }); }
    finally { setSyncing(false); }
  };

  useEffect(() => { if (authenticated) checkApiStatus(); }, [authenticated]);

  // ─── MEDIA CONTROLS ───
  const handleStopAudio = () => {
    if (playingAudio) { playingAudio.pause(); playingAudio.currentTime = 0; setPlayingAudio(null); setPlayingAudioId(null); }
  };

  const handlePlayPreview = (url: string, id: string) => {
    handleStopAudio();
    const audio = new Audio(url);
    audio.onended = () => { setPlayingAudio(null); setPlayingAudioId(null); };
    audio.play();
    setPlayingAudio(audio);
    setPlayingAudioId(id);
  };

  const handleRegenerateMedia = async (tweetId: string) => {
    setRegeneratingId(tweetId);
    try {
      // Find existing asset or create new one
      const tweet = tweets.find(t => t.id === tweetId);
      const existingAsset = mediaAssets[tweetId];

      if (existingAsset) {
        // Reset and re-trigger
        await supabase.from("media_assets").update({ status: "pending", audio_url: null, video_url: null, error_message: null, updated_at: new Date().toISOString() }).eq("id", existingAsset.id);
        await supabase.functions.invoke("async-media-worker", { body: { mediaAssetId: existingAsset.id } });
      } else if (tweet?.image_url) {
        // Create new asset
        const { data: newAsset } = await supabase.from("media_assets").insert({ tweet_id: tweetId, image_url: tweet.image_url, status: "pending" }).select("id").single();
        if (newAsset) {
          await supabase.functions.invoke("async-media-worker", { body: { mediaAssetId: newAsset.id } });
        }
      } else {
        toast({ title: "NO IMAGE", description: "Tweet has no image to build media from.", variant: "destructive" });
        return;
      }
      toast({ title: "REGENERATING", description: "Audio + video rendering started..." });
      fetchMediaAssets();
    } catch (e) {
      toast({ title: "Regeneration failed", description: String(e), variant: "destructive" });
    } finally { setRegeneratingId(null); }
  };

  // ─── HUNTER ───
  const handleAddTarget = async () => {
    if (!newHandle.trim()) return;
    setAddingTarget(true);
    try {
      const { error } = await supabase.functions.invoke("admin-hunter", { body: { action: "add", x_handle: newHandle.trim(), admin_token: getAdminToken() } });
      if (error) throw error;
      setNewHandle("");
      toast({ title: "TARGET ACQUIRED", description: `@${newHandle.trim()} added.` });
      fetchTargets();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
    finally { setAddingTarget(false); }
  };

  const handleRoastNow = async (id: string) => {
    setRoastingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-hunter", { body: { action: "roast", id, admin_token: getAdminToken() } });
      if (error) throw error;
      toast({ title: "ROAST DEPLOYED", description: data?.content?.slice(0, 80) + "..." });
      fetchTargets(); fetchTweets();
    } catch (e) { toast({ title: "Roast failed", description: String(e), variant: "destructive" }); }
    finally { setRoastingId(null); }
  };

  const handleDeleteTarget = async (id: string) => {
    await supabase.functions.invoke("admin-hunter", { body: { action: "delete", id, admin_token: getAdminToken() } });
    fetchTargets();
  };

  const handleToggleFollow = async (target: TargetAgent) => {
    try {
      const { error } = await supabase.functions.invoke("admin-hunter", { body: { action: "toggle_follow", id: target.id, auto_follow: !target.auto_follow, admin_token: getAdminToken() } });
      if (error) throw error;
      toast({ title: target.auto_follow ? "AUTO-FOLLOW OFF" : "AUTO-FOLLOW ON" });
      fetchTargets();
    } catch (e) { toast({ title: "Failed", description: String(e), variant: "destructive" }); }
  };

  const handleGenerateDrafts = async (target: TargetAgent) => {
    setDraftingId(target.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-hunter", { body: { action: "drafts", id: target.id, admin_token: getAdminToken() } });
      if (error) throw error;
      if (data?.drafts) {
        setDrafts((prev) => ({ ...prev, [target.id]: data.drafts }));
        setExpandedDrafts((prev) => ({ ...prev, [target.id]: true }));
      }
    } catch (e) { toast({ title: "Draft failed", description: String(e), variant: "destructive" }); }
    finally { setDraftingId(null); }
  };

  const handleExecuteNow = async (target: TargetAgent) => {
    if (recentExecCount >= 5) { toast({ title: "⚠️ RATE LIMIT", description: "Max 5/hour.", variant: "destructive" }); return; }
    setExecutingId(target.id);
    try {
      const { data, error } = await supabase.functions.invoke("execute-social-action", { body: { targetId: target.id } });
      if (error) throw error;
      if (data?.rateLimited) { toast({ title: "⚠️ RATE LIMIT", description: data.error, variant: "destructive" }); return; }
      const actions = [data?.followed && "Followed", data?.liked && "Liked"].filter(Boolean).join(" & ");
      toast({ title: actions || "PARTIAL" });
      fetchSocialLogs(); fetchNextTargets(); fetchExecCount();
    } catch (e) { toast({ title: "Execution failed", description: String(e), variant: "destructive" }); }
    finally { setExecutingId(null); }
  };

  const handleEditTargetHandle = async (id: string, newH: string) => {
    const clean = newH.replace(/^@/, "").trim();
    if (!clean) return;
    try {
      await supabase.functions.invoke("admin-hunter", { body: { action: "update_handle", id, x_handle: clean, admin_token: getAdminToken() } });
      toast({ title: "UPDATED" });
      setEditingTargetId(null); setEditingHandle("");
      fetchNextTargets(); fetchTargets();
    } catch (e) { toast({ title: "Update failed", description: String(e), variant: "destructive" }); }
  };

  const handleDeleteNextTarget = async (id: string) => {
    try {
      await supabase.functions.invoke("admin-hunter", { body: { action: "delete", id, admin_token: getAdminToken() } });
      toast({ title: "REMOVED" });
      fetchNextTargets(); fetchTargets();
    } catch (e) { toast({ title: "Delete failed", description: String(e), variant: "destructive" }); }
  };

  // ─── WATCHDOG HANDLERS ───
  const handleFetchWatchdog = async () => {
    setWatchdogLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-watchdog", { body: { fetchOnly: true } });
      if (error) throw error;
      setWatchdogTrending(data?.trending || []);
      // Fetch latest target from agent_logs
      const { data: logs } = await supabase.from("agent_logs").select("message").like("message", "%[WATCHDOG:TARGET]%").order("created_at", { ascending: false }).limit(1);
      if (logs?.[0]) setWatchdogTargetLog(logs[0].message.replace("[WATCHDOG:TARGET]: ", ""));
    } catch (e) { toast({ title: "Watchdog fetch failed", description: String(e), variant: "destructive" }); }
    finally { setWatchdogLoading(false); }
  };

  const handleRunWatchdog = async () => {
    setWatchdogRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-watchdog", { body: { force: true } });
      if (error) throw error;
      setWatchdogLastResult(data);
      if (data?.trending) setWatchdogTrending(data.trending);
      toast({ title: "GRID OBSERVER DEPLOYED", description: data?.content?.slice(0, 80) + "..." });
      fetchTweets();
    } catch (e) { toast({ title: "Watchdog failed", description: String(e), variant: "destructive" }); }
    finally { setWatchdogRunning(false); }
  };

  const getCooldownStatus = (lastRoastedAt: string | null) => {
    if (!lastRoastedAt) return { onCooldown: false, text: "READY" };
    const diff = Date.now() - new Date(lastRoastedAt).getTime();
    const hours48 = 48 * 60 * 60 * 1000;
    if (diff < hours48) {
      const remaining = hours48 - diff;
      return { onCooldown: true, text: `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m` };
    }
    return { onCooldown: false, text: "READY" };
  };

  // ─── LOGIN SCREEN ───
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center">
        <motion.div className="glass rounded-lg p-8 max-w-md w-full mx-4 space-y-6" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="flex items-center gap-3 justify-center">
            <Shield className="w-6 h-6 text-neon-magenta" />
            <h1 className="font-display text-xl font-bold tracking-[0.2em] text-foreground">HUSTLE ADMIN</h1>
          </div>
          <p className="text-muted-foreground text-xs text-center font-mono">CLASSIFIED ACCESS — ENTER PASSPHRASE</p>
          <Input type="password" placeholder="Enter admin passphrase..." value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} className="bg-muted border-border text-foreground" />
          <Button onClick={handleLogin} className="w-full" variant="default"><Shield className="w-4 h-4 mr-2" /> AUTHENTICATE</Button>
        </motion.div>
      </div>
    );
  }

  const pendingTweets = tweets.filter((t) => t.status === "pending");
  const postedTweets = tweets.filter((t) => t.status === "posted");
  const errorTweets = tweets.filter((t) => t.status === "error");
  const GOAL_SOL = 10;
  const solProgress = Math.min(100, (totalSol / GOAL_SOL) * 100);

  // ─── Helper: render tweet card with visual media ───
  const renderTweetCard = (tweet: TweetQueueItem, variant: "pending" | "posted" | "error") => {
    const asset = mediaAssets[tweet.id];
    const hasImage = !!tweet.image_url;
    const hasAudio = !!(tweet.audio_url || asset?.audio_url);
    const hasVideo = !!asset?.video_url;
    const audioUrl = tweet.audio_url || asset?.audio_url || "";
    const videoUrl = asset?.video_url || "";
    const isRendering = asset?.status === "pending" || asset?.status === "rendering";

    return (
      <Card key={tweet.id} className={`bg-card ${variant === "error" ? "border-destructive/40" : variant === "posted" ? "border-border opacity-70" : "border-border"}`}>
        <CardContent className="p-0">
          <div className="flex gap-0">
            {/* Thumbnail */}
            {hasImage && (
              <button
                onClick={() => setPreviewImage(tweet.image_url!)}
                className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 overflow-hidden rounded-l-lg group cursor-pointer"
              >
                <img src={tweet.image_url!} alt="Post visual" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye className="w-5 h-5 text-white" />
                </div>
              </button>
            )}

            {/* Content area */}
            <div className="flex-1 p-3 space-y-2 min-w-0">
              {editingId === tweet.id ? (
                <div className="space-y-2">
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="bg-muted border-border text-foreground" rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-foreground text-sm font-mono leading-snug line-clamp-3">{tweet.content}</p>

                  {/* Media badges row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {hasImage && <MediaBadge type="img" ready />}
                    {hasAudio ? <MediaBadge type="voice" ready /> : isRendering ? <MediaBadge type="voice" ready={false} /> : null}
                    {hasVideo ? <MediaBadge type="video" ready /> : isRendering ? <MediaBadge type="video" ready={false} /> : null}
                    {isRendering && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-yellow-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> RENDERING...
                      </span>
                    )}
                    {asset?.status === "error" && (
                      <span className="text-[9px] font-mono text-destructive">MEDIA ERROR</span>
                    )}
                  </div>

                  {/* Meta + Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                      <span className={tweet.type === "hunter" ? "text-destructive uppercase" : "uppercase"}>{tweet.type}</span>
                      <span>•</span>
                      <span>{new Date(tweet.created_at).toLocaleString()}</span>
                      <span className="text-muted-foreground">({tweet.content.length}/280)</span>
                      {(() => {
                        const { label, isPrime } = getScheduleLabel(tweet.scheduled_at, tweet.type);
                        return (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            label.includes("BREAKING") ? "bg-destructive/20 text-destructive border border-destructive/30" :
                            isPrime ? "bg-neon-green/10 text-neon-green border border-neon-green/30" :
                            "bg-muted text-muted-foreground border border-border"
                          }`}>{label}</span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Audio play */}
                      {hasAudio && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                          if (playingAudioId === tweet.id) handleStopAudio();
                          else handlePlayPreview(audioUrl, tweet.id);
                        }}>
                          {playingAudioId === tweet.id ? <Pause className="w-3 h-3 text-neon-magenta" /> : <Play className="w-3 h-3 text-neon-magenta" />}
                        </Button>
                      )}
                      {/* Video play */}
                      {hasVideo && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewVideo(videoUrl)}>
                          <Film className="w-3 h-3 text-neon-cyan" />
                        </Button>
                      )}
                      {/* Download MP4 */}
                      {hasVideo && (
                        <a href={videoUrl} download target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download MP4">
                            <Download className="w-3 h-3 text-neon-green" />
                          </Button>
                        </a>
                      )}
                      {/* Regenerate media */}
                      {(hasImage && variant === "pending") && (
                        <NeuralTooltip content="Neural re-imagining. Retries the generation of Image, Audio, or Video if the previous attempt failed or if the quality is not APEX-tier.">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={regeneratingId === tweet.id} onClick={() => handleRegenerateMedia(tweet.id)}>
                            {regeneratingId === tweet.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          </Button>
                        </NeuralTooltip>
                      )}
                      {variant !== "posted" && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handlePostNow(tweet.id)}>
                          <Send className="w-3 h-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(tweet)}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(tweet.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Error message */}
                  {tweet.error_message && (
                    <p className="text-[10px] font-mono text-destructive bg-destructive/10 rounded px-2 py-1">{tweet.error_message}</p>
                  )}
                  {variant === "posted" && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-neon-green" />
                      Posted {tweet.posted_at ? new Date(tweet.posted_at).toLocaleString() : "—"}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background grid-bg">
      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-2xl max-h-[80vh]">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            <button onClick={() => setPreviewImage(null)} className="absolute top-2 right-2 bg-black/60 rounded-full p-1"><X className="w-5 h-5 text-white" /></button>
          </div>
        </div>
      )}
      {/* Video Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewVideo(null)}>
          <div className="relative max-w-2xl">
            <video src={previewVideo} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg" />
            <button onClick={() => setPreviewVideo(null)} className="absolute top-2 right-2 bg-black/60 rounded-full p-1"><X className="w-5 h-5 text-white" /></button>
          </div>
        </div>
      )}

      <motion.header className="border-b border-border px-6 py-4 flex items-center justify-between" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-neon-magenta" />
          <h1 className="font-display text-lg font-bold tracking-[0.3em] text-foreground">X ENGINE — ADMIN</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* SOL Progress */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full bg-muted border border-border overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${solProgress}%`, background: "linear-gradient(90deg, hsl(180 100% 50%), hsl(300 100% 50%))" }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{totalSol.toFixed(3)}/{GOAL_SOL} SOL</span>
          </div>
          <div className="flex items-center gap-2">
            {apiStatus === "connected" ? <CheckCircle className="w-4 h-4 text-neon-green" /> : apiStatus === "error" ? <AlertCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
            <span className="text-[10px] font-mono text-muted-foreground">X: {apiStatus.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Film className={`w-3.5 h-3.5 ${mediaStatus === "rendering" ? "text-yellow-400 animate-pulse" : mediaStatus === "error" ? "text-destructive" : "text-neon-cyan"}`} />
            <span className={`text-[10px] font-mono ${mediaStatus === "rendering" ? "text-yellow-400" : mediaStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>MEDIA: {mediaStatus === "rendering" ? "RENDERING..." : mediaStatus.toUpperCase()}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/")}>← Dashboard</Button>
        </div>
      </motion.header>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Autopilot Banner */}
        <motion.div className={`rounded-lg p-4 border flex items-center justify-between ${autopilot ? "bg-neon-green/5 border-neon-green/30" : "bg-muted border-border"}`} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3">
            <Power className={`w-5 h-5 ${autopilot ? "text-neon-green" : "text-muted-foreground"}`} />
            <div>
              <h3 className="font-display text-sm tracking-widest text-foreground">AUTOPILOT MODE</h3>
              <p className="text-[10px] font-mono text-muted-foreground">
                {autopilot ? "Prime time targeting active • 8 posts/day • Async media pipeline" : "Manual mode — generate and post yourself"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {autopilot && (
              <div className="text-right">
                <p className="text-[10px] font-mono text-muted-foreground tracking-widest">NEXT AUTO-POST</p>
                <p className="font-mono text-sm text-neon-cyan font-bold">{countdown}</p>
              </div>
            )}
            <Switch checked={autopilot} onCheckedChange={setAutopilot} />
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted border border-border flex-wrap">
            <TabsTrigger value="queue">Tweet Queue</TabsTrigger>
            <TabsTrigger value="manual">Manual Post</TabsTrigger>
            <TabsTrigger value="hunter"><Crosshair className="w-3 h-3 mr-1" /> Hunter</TabsTrigger>
            <TabsTrigger value="social"><Activity className="w-3 h-3 mr-1" /> Social Activity</TabsTrigger>
            <TabsTrigger value="watchdog"><Radio className="w-3 h-3 mr-1" /> Watchdog</TabsTrigger>
            <TabsTrigger value="snipe" className="text-neon-magenta data-[state=active]:text-neon-magenta">
              <Zap className="w-3 h-3 mr-1" /> Flash Snipe
            </TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
            <TabsTrigger value="status">System</TabsTrigger>
            <TabsTrigger value="token-override" className="text-yellow-400 data-[state=active]:text-yellow-400">
              <TrendingUp className="w-3 h-3 mr-1" /> Token Override
            </TabsTrigger>
          </TabsList>

          {/* TWEET QUEUE TAB */}
          <TabsContent value="queue" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">PENDING ({pendingTweets.length})</h2>
              <div className="flex gap-2">
                <NeuralTooltip content="Bypasses the 2026 schedule. Immediately publishes all overdue pending transmissions to the X network.">
                  <Button onClick={handleForceSync} disabled={syncing} size="sm" variant="destructive"><Zap className="w-4 h-4 mr-1" />{syncing ? "Syncing..." : "FORCE SYNC"}</Button>
                </NeuralTooltip>
                {!autopilot && <Button onClick={handleGenerateNow} disabled={generating} size="sm"><Zap className="w-4 h-4 mr-1" />{generating ? "Generating..." : "Generate Now"}</Button>}
                <Button onClick={handleBatchPreGenerate} disabled={batchGenerating} size="sm" variant="outline" className="border-neon-cyan/50 text-neon-cyan"><Activity className="w-4 h-4 mr-1" />{batchGenerating ? "Pre-Generating..." : "PRE-GEN 24H"}</Button>
                <Button onClick={handleInjectMedia} disabled={injectingMedia} size="sm" variant="outline" className="border-neon-magenta/50 text-neon-magenta"><Film className="w-4 h-4 mr-1" />{injectingMedia ? "Rendering..." : "INJECT MEDIA"}</Button>
                <Button onClick={() => { fetchTweets(); fetchMediaAssets(); }} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </div>

            {pendingTweets.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                <Power className="w-8 h-8 mx-auto mb-3 text-neon-green opacity-50" />
                {autopilot ? <>Autopilot active. Next post in: <span className="text-neon-cyan font-mono">{countdown}</span></> : 'No pending tweets. Hit "Generate Now".'}
              </div>
            )}

            {pendingTweets.map((tweet) => renderTweetCard(tweet, "pending"))}

            {errorTweets.length > 0 && (
              <>
                <h2 className="font-display text-sm tracking-widest text-destructive pt-4">ERRORS ({errorTweets.length})</h2>
                {errorTweets.map((tweet) => renderTweetCard(tweet, "error"))}
              </>
            )}

            {postedTweets.length > 0 && (
              <>
                <h2 className="font-display text-sm tracking-widest text-muted-foreground pt-4">POSTED ({postedTweets.length})</h2>
                {postedTweets.slice(0, 10).map((tweet) => renderTweetCard(tweet, "posted"))}
              </>
            )}
          </TabsContent>

          {/* MANUAL POST TAB */}
          <TabsContent value="manual" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm font-display tracking-widest">COMPOSE TWEET</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Write a tweet as HustleCore..." value={manualTweet} onChange={(e) => setManualTweet(e.target.value)} className="bg-muted border-border text-foreground min-h-[120px]" maxLength={280} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{manualTweet.length}/280</span>
                  <Button onClick={handleManualPost} disabled={posting || !manualTweet.trim()}><Twitter className="w-4 h-4 mr-2" />{posting ? "Queuing..." : "Add to Queue"}</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HUNTER TAB */}
          <TabsContent value="hunter" className="space-y-4">
            <Card className="bg-card border-destructive/30">
              <CardHeader>
                <CardTitle className="text-sm font-display tracking-widest flex items-center gap-2 text-destructive"><Crosshair className="w-4 h-4" />TARGET ACQUISITION</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="@target_agent_handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddTarget()} className="bg-muted border-border text-foreground font-mono" />
                  <Button onClick={handleAddTarget} disabled={addingTarget || !newHandle.trim()} size="sm"><Plus className="w-4 h-4 mr-1" />{addingTarget ? "Adding..." : "Add Target"}</Button>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground">48h cooldown between roasts. Manual targets processed first.</p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">ACTIVE TARGETS ({targets.filter(t => t.is_active).length})</h2>
              <Button onClick={fetchTargets} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
            </div>

            {targets.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm"><Crosshair className="w-8 h-8 mx-auto mb-3 text-destructive opacity-50" />No targets acquired.</div>
            )}

            {targets.map((target) => {
              const cooldown = getCooldownStatus(target.last_roasted_at);
              const targetDrafts = drafts[target.id] || [];
              const isExpanded = expandedDrafts[target.id] || false;
              return (
                <Card key={target.id} className={`bg-card ${target.is_active ? "border-destructive/30" : "border-border opacity-50"}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Crosshair className={`w-4 h-4 ${target.is_active ? "text-destructive" : "text-muted-foreground"}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-mono text-sm font-bold">@{target.x_handle}</span>
                            {target.source === "discovery" && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">DISCOVERY</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${cooldown.onCooldown ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" : "bg-neon-green/10 text-neon-green border border-neon-green/20"}`}>
                              {cooldown.onCooldown ? `COOLDOWN: ${cooldown.text}` : cooldown.text}
                            </span>
                            {target.followed_at && <span className="text-[10px] text-neon-cyan font-mono">✓ Following</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <Switch checked={target.auto_follow} onCheckedChange={() => handleToggleFollow(target)} className="scale-75" />
                          <span className="text-[9px] font-mono text-muted-foreground">Follow</span>
                        </div>
                        <NeuralTooltip content="Strategic planning. Claude 3.5 researches the target via Tavily and suggests 3 unique roast strategies. Use this to review and edit before posting.">
                          <Button size="sm" variant="outline" disabled={draftingId === target.id} onClick={() => handleGenerateDrafts(target)}>
                            {draftingId === target.id ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Researching...</> : <><Lightbulb className="w-3 h-3 mr-1" /> Draft</>}
                          </Button>
                        </NeuralTooltip>
                        <NeuralTooltip content="Executes a surgical strike. Immediately generates a context-aware roast (Text + Image) and posts it to X. Full video rendering starts in the background.">
                          <Button size="sm" variant="destructive" disabled={cooldown.onCooldown || roastingId === target.id} onClick={() => handleRoastNow(target.id)}>
                            <Zap className="w-3 h-3 mr-1" />{roastingId === target.id ? "Roasting..." : "Roast Now"}
                          </Button>
                        </NeuralTooltip>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteTarget(target.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    </div>
                    {targetDrafts.length > 0 && (
                      <div className="space-y-2">
                        <button onClick={() => setExpandedDrafts((prev) => ({ ...prev, [target.id]: !isExpanded }))} className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {targetDrafts.length} DRAFTS
                        </button>
                        {isExpanded && (
                          <div className="space-y-2 pl-4 border-l-2 border-destructive/20">
                            {targetDrafts.map((draft, idx) => (
                              <div key={idx} className="glass rounded-lg p-3 space-y-2">
                                <p className="text-foreground text-xs font-mono leading-relaxed">{draft.content}</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-mono text-muted-foreground">{draft.model} • {draft.angle.slice(0, 40)}</span>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { navigator.clipboard.writeText(draft.content); toast({ title: "COPIED" }); }}><Copy className="w-3 h-3 mr-1" /> Copy</Button>
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-neon-cyan" onClick={() => { setManualTweet(draft.content); setActiveTab("manual"); }}><ArrowRight className="w-3 h-3 mr-1" /> Manual Post</Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* SOCIAL ACTIVITY TAB */}
          <TabsContent value="social" className="space-y-6">

            {/* Daily Progress Bars */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-mono tracking-widest text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neon-green" /> DAILY SOCIAL QUOTA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dailyQuota ? (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">FOLLOWS TODAY</span>
                        <span className={`font-bold ${dailyQuota.follows_count >= dailyQuota.follows_limit ? "text-destructive" : "text-neon-green"}`}>
                          {dailyQuota.follows_count} / {dailyQuota.follows_limit}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted border border-border overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${Math.min(100, (dailyQuota.follows_count / dailyQuota.follows_limit) * 100)}%`,
                          background: dailyQuota.follows_count >= dailyQuota.follows_limit ? "hsl(var(--destructive))" : "linear-gradient(90deg, hsl(var(--neon-green)), hsl(160 100% 50%))"
                        }} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">LIKES TODAY</span>
                        <span className={`font-bold ${dailyQuota.likes_count >= dailyQuota.likes_limit ? "text-destructive" : "text-neon-cyan"}`}>
                          {dailyQuota.likes_count} / {dailyQuota.likes_limit}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted border border-border overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${Math.min(100, (dailyQuota.likes_count / dailyQuota.likes_limit) * 100)}%`,
                          background: dailyQuota.likes_count >= dailyQuota.likes_limit ? "hsl(var(--destructive))" : "linear-gradient(90deg, hsl(var(--neon-cyan)), hsl(200 100% 50%))"
                        }} />
                      </div>
                    </div>
                    <p className="text-[9px] font-mono text-muted-foreground">Resets at midnight UTC • Runs every 30 min • 60% idle / 30% like / 10% follow</p>
                  </>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground">No activity today yet. Social Pulse runs every 30 minutes.</p>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">RECENT ACTIVITY ({socialLogs.length})</h2>
              <div className="flex gap-2">
                <NeuralTooltip content="Forces an immediate autonomous cycle. Triggers X-scanning, terminal log generation, and scheduled social actions without waiting for the next timer tick.">
                  <Button onClick={async () => {
                    setPulseRunning(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("social-pulse", {});
                      if (error) throw error;
                      const action = data?.action || "idle";
                      const msg = action === "idle" ? "Idled this cycle." : action === "follow" ? `Followed @${data?.target}` : action === "like" ? `Liked @${data?.target}` : `Skipped: ${data?.reason}`;
                      toast({ title: `PULSE: ${action.toUpperCase()}`, description: msg });
                      fetchSocialLogs(); fetchDailyQuota(); fetchNextTargets();
                    } catch (e) { toast({ title: "Pulse failed", description: String(e), variant: "destructive" }); }
                    finally { setPulseRunning(false); }
                  }} disabled={pulseRunning} size="sm" className="bg-neon-green/10 border border-neon-green/30 text-neon-green hover:bg-neon-green/20">
                    {pulseRunning ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running...</> : <>⚡ TRIGGER PULSE</>}
                  </Button>
                </NeuralTooltip>
                <NeuralTooltip content="Autonomous scout mode. Searches the grid for trending AI agents, influential whales, and Base ecosystem leaders to add to our hunting list.">
                  <Button onClick={async () => {
                    setDiscovering(true); setDiscoveryLog("Scanning...");
                    try {
                      const { data, error } = await supabase.functions.invoke("auto-follow", { body: { discoveryOnly: true } });
                      if (error) throw error;
                      setDiscoveryLog(`Found ${data?.discovered || 0} new targets.`);
                      fetchNextTargets(); fetchTargets();
                      setTimeout(() => setDiscoveryLog(null), 8000);
                    } catch (e) { setDiscoveryLog(`Failed: ${e}`); setTimeout(() => setDiscoveryLog(null), 5000); }
                    finally { setDiscovering(false); }
                  }} disabled={discovering} size="sm" className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20">
                    {discovering ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning...</> : <>⚡️ DISCOVERY SCAN</>}
                  </Button>
                </NeuralTooltip>
                <Button onClick={() => { fetchSocialLogs(); fetchNextTargets(); fetchDailyQuota(); }} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </div>

            {discoveryLog && (
              <div className="glass rounded-lg p-3 flex items-center gap-2 text-[10px] font-mono text-neon-cyan border border-neon-cyan/20">
                {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                {discoveryLog}
              </div>
            )}

            {socialLogs.length === 0 ? (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm"><Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />No activity logged yet. Social Pulse fires every 30 minutes.</div>
            ) : (
              <div className="space-y-2">
                {socialLogs.map((log: any) => (
                  <Card key={log.id} className="bg-card border-border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${log.action_type === "follow" ? "bg-neon-green" : "bg-neon-cyan"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-foreground text-sm font-mono font-bold">{log.action_type === "follow" ? "Followed" : "Liked"}</span>
                              <span className="text-neon-cyan font-mono text-sm font-bold">@{log.target_handle}</span>
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                                log.source === "auto_pulse" ? "bg-neon-green/10 text-neon-green border border-neon-green/20" :
                                log.source === "discovery" ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20" :
                                "bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/20"
                              }`}>{log.source?.toUpperCase()}</span>
                            </div>
                            {log.reason && (
                              <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{log.reason}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* NEXT SESSIONS */}
            <div className="pt-2">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground mb-3 flex items-center gap-2"><Eye className="w-4 h-4" />NEXT SESSIONS ({nextTargets.length})</h2>
              {recentExecCount >= 4 && (
                <div className={`glass rounded-lg p-3 flex items-center gap-2 text-[10px] font-mono mb-3 ${recentExecCount >= 5 ? "text-destructive border border-destructive/30" : "text-yellow-400 border border-yellow-500/30"}`}>
                  <AlertCircle className="w-3 h-3" />{recentExecCount >= 5 ? "⚠️ Rate limit reached (5/5)." : `⚠️ ${recentExecCount}/5 executions this hour.`}
                </div>
              )}
              {nextTargets.length === 0 ? (
                <div className="glass rounded-lg p-6 text-center text-muted-foreground text-sm">No upcoming sessions. Discovery runs automatically via Social Pulse.</div>
              ) : (
                <div className="space-y-2">
                  {nextTargets.map((target, idx) => (
                    <Card key={target.id} className="bg-card border-border">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-muted-foreground w-4">{idx + 1}.</span>
                            {editingTargetId === target.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-foreground text-sm font-mono">@</span>
                                <Input value={editingHandle} onChange={(e) => setEditingHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEditTargetHandle(target.id, editingHandle)} className="bg-muted border-border text-foreground font-mono h-7 w-40 text-sm" />
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => handleEditTargetHandle(target.id, editingHandle)}>✓</Button>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingTargetId(null)}>✗</Button>
                              </div>
                            ) : (
                              <span className={`text-foreground text-sm font-mono font-bold ${target.source === "discovery" ? "text-neon-cyan" : "text-neon-magenta"}`}>@{target.x_handle}</span>
                            )}
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${target.source === "discovery" ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20" : "bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/20"}`}>{target.source?.toUpperCase() || "MANUAL"}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button onClick={() => handleExecuteNow(target)} disabled={executingId === target.id || recentExecCount >= 5} size="sm" variant="outline" className="h-7 text-[10px] border-neon-green/30 text-neon-green hover:bg-neon-green/10">
                              {executingId === target.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />} Execute
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingTargetId(target.id); setEditingHandle(target.x_handle); }}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDeleteNextTarget(target.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>


          {/* MARKET WATCHDOG TAB */}
          <TabsContent value="watchdog" className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-neon-cyan animate-pulse" />
                <h2 className="font-display text-sm tracking-widest text-muted-foreground">MARKET WATCHDOG — BASE NETWORK</h2>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleFetchWatchdog} disabled={watchdogLoading} size="sm" variant="outline" className="border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10">
                  {watchdogLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning...</> : <><TrendingUp className="w-3 h-3 mr-1" /> SCAN TRENDING</>}
                </Button>
                <Button onClick={handleRunWatchdog} disabled={watchdogRunning} size="sm" variant="destructive">
                  {watchdogRunning ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Deploying...</> : <><Zap className="w-3 h-3 mr-1" /> RUN GRID OBSERVER</>}
                </Button>
              </div>
            </div>

            {/* Current Watch Target */}
            {watchdogTargetLog && (
              <motion.div
                className="rounded-lg p-4 border border-neon-cyan/30 bg-neon-cyan/5 space-y-1"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-2 text-[10px] font-mono text-neon-cyan tracking-widest">
                  <Radio className="w-3 h-3 animate-pulse" />
                  CURRENTLY WATCHING
                </div>
                <p className="text-foreground text-sm font-mono">{watchdogTargetLog}</p>
              </motion.div>
            )}

            {/* Last Generated Post */}
            {watchdogLastResult?.content && (
              <Card className="bg-card border-neon-green/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-mono text-neon-green tracking-widest flex items-center gap-2">
                    <CheckCircle className="w-3 h-3" /> LAST GRID OBSERVER POST
                    <span className="text-muted-foreground ml-auto capitalize">{watchdogLastResult.tone?.replace(/_/g, " ")}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-foreground text-sm font-mono leading-relaxed">{watchdogLastResult.content}</p>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>Model: {watchdogLastResult.model}</span>
                    {watchdogLastResult.token && (
                      <span>• Target: ${watchdogLastResult.token.symbol} | MCap: ${
                        watchdogLastResult.token.marketCap >= 1_000_000
                          ? `${(watchdogLastResult.token.marketCap / 1_000_000).toFixed(1)}M`
                          : watchdogLastResult.token.marketCap >= 1_000
                          ? `${(watchdogLastResult.token.marketCap / 1_000).toFixed(1)}K`
                          : watchdogLastResult.token.marketCap
                      }</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trending Tokens Grid */}
            {watchdogTrending.length === 0 ? (
              <div className="glass rounded-lg p-10 text-center text-muted-foreground text-sm space-y-2">
                <TrendingUp className="w-8 h-8 mx-auto opacity-30" />
                <p>No scan data yet. Hit <span className="text-neon-cyan font-mono">SCAN TRENDING</span> to fetch live Base network tokens.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="font-display text-xs tracking-widest text-muted-foreground">TOP TRENDING — BASE NETWORK ({watchdogTrending.length} tokens)</h3>
                {watchdogTrending.map((token: any, idx: number) => {
                  const isUp = token.priceChange24h > 0;
                  const mcap = token.marketCap >= 1_000_000
                    ? `$${(token.marketCap / 1_000_000).toFixed(2)}M`
                    : token.marketCap >= 1_000
                    ? `$${(token.marketCap / 1_000).toFixed(1)}K`
                    : `$${token.marketCap?.toFixed(0) || "N/A"}`;
                  return (
                    <Card key={token.address || idx} className="bg-card border-border hover:border-neon-cyan/30 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-muted-foreground w-5">{idx + 1}.</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-mono font-bold text-sm">${token.symbol}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{token.name}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">MCap: {mcap}</span>
                                <span className={`text-[10px] font-mono font-bold ${isUp ? "text-neon-green" : "text-destructive"}`}>
                                  {isUp ? "▲" : "▼"} {Math.abs(token.priceChange24h)?.toFixed(1)}% 24h
                                </span>
                                {token.volume24h > 0 && (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    Vol: ${token.volume24h >= 1_000 ? `${(token.volume24h / 1_000).toFixed(0)}K` : token.volume24h?.toFixed(0)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {token.pairUrl && (
                              <a href={token.pairUrl} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="ghost" className="h-7 text-[10px] text-neon-cyan px-2">Chart ↗</Button>
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Info box */}
            <div className="rounded-lg p-3 border border-border bg-muted/30 text-[10px] font-mono text-muted-foreground space-y-1">
              <p className="text-foreground font-bold tracking-widest">HOW IT WORKS</p>
              <p>• <span className="text-neon-cyan">SCAN TRENDING</span> fetches live Base network token data from DexScreener.</p>
              <p>• <span className="text-destructive">RUN GRID OBSERVER</span> picks the highest-volume token, picks a random tone (backhanded congrats / auditor roast / cold prediction), generates + queues the tweet.</p>
              <p>• Runs automatically once per day at 08:00 UTC via autopilot. Force-run overrides the daily cap.</p>
              <p>• Handles: matched from Hunter target list if available. $CASHTAG always included.</p>
            </div>
          </TabsContent>

          {/* VIP RADAR TAB */}
          <TabsContent value="snipe" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-sm tracking-widest text-neon-magenta flex items-center gap-2">
                  <Crosshair className="w-4 h-4" /> VIP RADAR — SNIPER MODULE
                </h2>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Rotates through VIP targets every 15 min. Tavily + Claude 3.5 Viral Intercept. Max 1/VIP/day.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${sniperMode ? "border-neon-magenta/40 bg-neon-magenta/5" : "border-border bg-muted/30"}`}>
                  <Crosshair className={`w-3.5 h-3.5 ${sniperMode ? "text-neon-magenta" : "text-muted-foreground"}`} />
                  <span className={`text-[10px] font-mono font-bold tracking-widest ${sniperMode ? "text-neon-magenta" : "text-muted-foreground"}`}>SNIPER MODE</span>
                  <Switch checked={sniperMode} onCheckedChange={handleSniperModeToggle} disabled={sniperModeLoading} className="scale-75" />
                </div>
                <NeuralTooltip content="Dry-run: generates a Viral Intercept for the next VIP in rotation but does NOT post. Safe for previewing tone and content before going live.">
                  <Button onClick={() => handleFlashSnipe(true)} disabled={snipeDryRunning || snipeRunning} size="sm" variant="outline" className="border-neon-magenta/50 text-neon-magenta">
                    <Eye className="w-4 h-4 mr-1" />{snipeDryRunning ? "Scanning..." : "DRY RUN"}
                  </Button>
                </NeuralTooltip>
                <NeuralTooltip content="Forces an immediate intercept on the next VIP in rotation. Tavily researches the topic, Claude 3.5 writes the reply, posts live to X. Hard limit: 1 intercept per VIP per 24h.">
                  <Button onClick={() => handleFlashSnipe(false)} disabled={snipeRunning || snipeDryRunning || !sniperMode} size="sm" variant="destructive">
                    <Zap className="w-4 h-4 mr-1" />{snipeRunning ? "Intercepting..." : "⚡ EXECUTE SNIPE"}
                  </Button>
                </NeuralTooltip>
                <Button onClick={() => { fetchVipTargets(); fetchVipReplyLogs(); }} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* VIP Targets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vipTargets.map((vip: any) => {
                const repliedToday = vip.last_replied_at && new Date(vip.last_replied_at) > new Date(Date.now() - 86400000);
                const lastLog = vipReplyLogs.find((l: any) => l.vip_handle === vip.x_handle);
                return (
                  <Card key={vip.id} className={`bg-card border transition-colors ${repliedToday ? "border-neon-green/40" : "border-neon-magenta/20 hover:border-neon-magenta/40"}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Crosshair className={`w-4 h-4 shrink-0 ${repliedToday ? "text-neon-green" : "text-neon-magenta"}`} />
                          <span className="font-mono font-bold text-foreground text-sm">{vip.display_name}</span>
                        </div>
                        {repliedToday
                          ? <Badge className="text-[9px] bg-neon-green/15 text-neon-green border border-neon-green/30">FIRED ✓</Badge>
                          : <Badge className="text-[9px] bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/30">READY</Badge>}
                      </div>
                      <p className="text-[11px] font-mono text-neon-cyan">@{vip.x_handle}</p>
                      <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
                        <p>Checked: {vip.last_checked_at ? new Date(vip.last_checked_at).toLocaleString() : "—"}</p>
                        <p>Replied: {vip.last_replied_at ? new Date(vip.last_replied_at).toLocaleString() : "Never"}</p>
                      </div>
                      {lastLog && (
                        <div className="pt-1 border-t border-border space-y-1">
                          <p className="text-[9px] font-mono text-muted-foreground">LAST INTERCEPT:</p>
                          <p className="text-[10px] font-mono text-foreground/80 line-clamp-2 bg-neon-magenta/5 rounded px-2 py-1">"{lastLog.reply_text?.slice(0, 100)}…"</p>
                          {lastLog.tweet_url && (
                            <a href={lastLog.tweet_url} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono text-neon-cyan hover:underline flex items-center gap-1">
                              <ExternalLink className="w-2.5 h-2.5" /> View VIP tweet ↗
                            </a>
                          )}
                          {(lastLog.like_count || 0) > 0 && (
                            <p className="text-[9px] font-mono text-neon-green">
                              {lastLog.like_count >= 10 ? "🔥" : "❤️"} {lastLog.like_count} likes{lastLog.like_count >= 10 ? " — VIRAL CONFIRMED" : ""}
                            </p>
                          )}
                        </div>
                      )}
                      <Button size="sm" variant="ghost" className="w-full text-[10px] h-7 text-neon-magenta border border-neon-magenta/20 hover:bg-neon-magenta/10"
                        disabled={snipeRunning || snipeDryRunning || repliedToday || !sniperMode}
                        onClick={() => handleFlashSnipe(false, vip.x_handle)}>
                        <Zap className="w-3 h-3 mr-1" /> TARGET NOW
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Last run result */}
            {snipeLastResult && (
              <Card className={`bg-card border ${snipeLastResult.fired > 0 ? "border-neon-green/40" : "border-border"}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-xs tracking-widest text-muted-foreground">LAST EXECUTION —</span>
                    <span className="font-mono text-xs font-bold text-neon-cyan">@{snipeLastResult.handle}</span>
                    <Badge className={`text-[9px] border ${snipeLastResult.fired > 0 ? "bg-neon-green/15 text-neon-green border-neon-green/30" : snipeLastResult.status === "rate_limited" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" : "bg-muted text-muted-foreground border-border"}`}>
                      {(snipeLastResult.status || "unknown").toUpperCase().replace(/_/g, " ")}
                    </Badge>
                    {snipeLastResult.dryRun && <Badge className="text-[9px] bg-neon-magenta/15 text-neon-magenta border border-neon-magenta/30">DRY RUN</Badge>}
                  </div>
                  {snipeLastResult.intercept && (
                    <p className="text-[12px] font-mono text-foreground/90 bg-neon-magenta/5 border border-neon-magenta/20 rounded p-3 leading-relaxed">"{snipeLastResult.intercept}"</p>
                  )}
                  {snipeLastResult.tweetUrl && (
                    <a href={snipeLastResult.tweetUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-neon-cyan hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> VIP original tweet ↗
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Intercept Log */}
            <div className="space-y-2">
              <h3 className="font-display text-xs tracking-widest text-muted-foreground">INTERCEPT LOG</h3>
              {vipReplyLogs.length === 0 ? (
                <p className="text-xs font-mono text-muted-foreground text-center py-6">No intercepts yet. Run DRY RUN or EXECUTE SNIPE.</p>
              ) : vipReplyLogs.map((log: any) => (
                <Card key={log.id} className="bg-card border-border hover:border-neon-magenta/20 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-neon-cyan">@{log.vip_handle}</span>
                        {log.reply_sent ? <Badge className="text-[9px] bg-neon-green/15 text-neon-green border border-neon-green/30">LIVE</Badge> : <Badge className="text-[9px] bg-muted text-muted-foreground border-border">DRY RUN</Badge>}
                        {(log.like_count || 0) >= 10 && <Badge className="text-[9px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">🔥 VIRAL {log.like_count} LIKES</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {log.tweet_url && <a href={log.tweet_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-neon-cyan"><ExternalLink className="w-3 h-3" /></a>}
                        <span className="text-[9px] font-mono text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground mb-1.5 line-clamp-1">VIP: "{log.tweet_content?.slice(0, 100)}…"</p>
                    <p className="text-[11px] font-mono text-foreground/90 bg-neon-magenta/5 border border-neon-magenta/20 rounded p-2">↳ "{log.reply_text}"</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-lg p-3 border border-border bg-muted/30 text-[10px] font-mono text-muted-foreground space-y-1">
              <p className="text-foreground font-bold tracking-widest">VIP SNIPER PROTOCOL</p>
              <p>• Rotates through one VIP per 15-min cron tick (least-recently-checked first).</p>
              <p>• <span className="text-neon-magenta">TAVILY</span> provides real-time intel on the tweet topic before Claude crafts the reply.</p>
              <p>• <span className="text-neon-magenta">CLAUDE 3.5 SONNET</span> writes the viral intercept — sarcastic, peer-level, no hashtags, no links.</p>
              <p>• If a reply hits <span className="text-neon-green">10+ likes</span>, the terminal logs: [SYSTEM]: Neural intercept successful.</p>
              <p>• Hard limit: <span className="text-neon-cyan">1 reply per VIP per 24 hours</span>. TARGET NOW prioritizes a specific VIP instantly.</p>
            </div>
          </TabsContent>

          {/* MENTIONS TAB */}
          <TabsContent value="mentions" className="space-y-4">

            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">RECENT MENTIONS ({mentions.length})</h2>
              <Button onClick={fetchMentions} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
            </div>
            {mentions.map((m) => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-neon-cyan font-mono text-sm font-bold">@{m.author_handle}</span>
                    {m.replied && <Badge variant="secondary" className="text-[9px]">REPLIED</Badge>}
                  </div>
                  <p className="text-foreground text-sm font-mono">{m.content}</p>
                  <span className="text-[10px] text-muted-foreground mt-2 block">{new Date(m.created_at).toLocaleString()}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* SYSTEM TAB */}
          <TabsContent value="status" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm font-display tracking-widest">SYSTEM STATUS</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  {apiStatus === "connected" ? <CheckCircle className="w-5 h-5 text-neon-green" /> : <AlertCircle className="w-5 h-5 text-destructive" />}
                  <span className="text-foreground font-mono">X API: {apiStatus.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Film className={`w-5 h-5 ${mediaStatus === "error" ? "text-destructive" : "text-neon-cyan"}`} />
                  <span className="text-foreground font-mono">Media Pipeline: {mediaStatus.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-neon-green" />
                  <span className="text-foreground font-mono">SOL Progress: {totalSol.toFixed(3)} / {GOAL_SOL} SOL ({solProgress.toFixed(1)}%)</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={checkApiStatus} variant="outline" size="sm">Re-check API</Button>
                  <Button onClick={handleForceSync} disabled={syncing} variant="outline" size="sm">{syncing ? "Syncing..." : "Force Sync"}</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TOKEN OVERRIDE TAB */}
          <TabsContent value="token-override" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-display tracking-widest text-yellow-400">⚡ TOKEN PRICE OVERRIDE</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  During the Virtuals Prototype phase, DexScreener may show stale or inaccurate data.
                  Enable the manual override to pin accurate values directly from Virtuals.io to the live dashboard.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Toggle */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={overrideEnabled}
                    onCheckedChange={setOverrideEnabled}
                    className="data-[state=checked]:bg-yellow-400"
                  />
                  <span className="text-sm font-mono">
                    {overrideEnabled ? (
                      <span className="text-yellow-400 font-bold">MANUAL OVERRIDE ACTIVE</span>
                    ) : (
                      <span className="text-muted-foreground">Use live DexScreener data</span>
                    )}
                  </span>
                </div>

                {/* Price input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground tracking-widest uppercase">Token Price (USD)</label>
                  <Input
                    value={overridePrice}
                    onChange={(e) => setOverridePrice(e.target.value)}
                    placeholder="0.00000529"
                    className="font-mono text-sm"
                    disabled={!overrideEnabled}
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Market Cap = price × 1,000,000,000. Current: ${overrideEnabled && overridePrice ? (parseFloat(overridePrice) * 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}
                  </p>
                </div>

                {/* 24h change input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground tracking-widest uppercase">24h Price Change (%)</label>
                  <Input
                    value={overrideChangeH24}
                    onChange={(e) => setOverrideChangeH24(e.target.value)}
                    placeholder="20.13"
                    className="font-mono text-sm"
                    disabled={!overrideEnabled}
                  />
                  <p className="text-[9px] text-muted-foreground">Positive = green (e.g. 20.13), negative = red (e.g. -5.4)</p>
                </div>

                {/* Save button */}
                <Button
                  onClick={saveTokenOverride}
                  disabled={overrideSaving}
                  className="bg-yellow-400/10 border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/20 font-mono text-xs tracking-widest"
                  variant="outline"
                >
                  {overrideSaving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> SAVING...</> : "💾 SAVE OVERRIDE"}
                </Button>

                {/* Status */}
                {overrideLoaded && (
                  <div className="text-[9px] text-muted-foreground border-t border-border pt-3">
                    <span className="font-bold text-yellow-400/70">NOTE:</span> The override is applied on the next 30s polling cycle. Use the refresh icon on the token widget to see changes immediately.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </TooltipProvider>
  );
};

export default HustleAdmin;
