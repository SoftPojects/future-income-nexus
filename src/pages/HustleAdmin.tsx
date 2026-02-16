import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Send, RefreshCw, Trash2, Edit2, Zap, Twitter, Clock, CheckCircle, AlertCircle, Power, Crosshair, Plus, Lightbulb, Copy, ArrowRight, ChevronDown, ChevronUp, Loader2, Activity, Eye, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TweetQueueItem {
  id: string;
  content: string;
  status: string;
  scheduled_at: string;
  type: string;
  created_at: string;
  posted_at: string | null;
  error_message?: string | null;
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
// Prime time windows in UTC:
// Slot 1 (US Morning):    UTC 14:00-15:00
// Slot 2 (US Lunch):      UTC 17:00-18:30
// Slot 3 (US Afternoon):  UTC 20:00-21:30
function getScheduleLabel(scheduledAt: string, type: string): { label: string; isPrime: boolean } {
  if (type === "breaking") return { label: "🚨 BREAKING NEWS", isPrime: true };
  if (type === "premium") return { label: "🎬 PREMIUM ENTITY POST", isPrime: true };
  if (type === "whale_tribute") return { label: "🐋 WHALE TRIBUTE", isPrime: true };
  if (type === "manual") return { label: "MANUAL POST", isPrime: false };
  if (type === "trend") return { label: "TREND INTEL", isPrime: false };

  const date = new Date(scheduledAt);
  const utcH = date.getUTCHours();
  const utcM = date.getUTCMinutes();
  const totalMin = utcH * 60 + utcM;

  if (totalMin >= 14 * 60 && totalMin < 15 * 60) return { label: "TARGETING: US MORNING PEAK", isPrime: true };
  if (totalMin >= 17 * 60 && totalMin < 18 * 60 + 30) return { label: "TARGETING: US LUNCH PEAK", isPrime: true };
  if (totalMin >= 20 * 60 && totalMin < 21 * 60 + 30) return { label: "TARGETING: US AFTERNOON PEAK", isPrime: true };
  return { label: "OFF-PEAK FILLER", isPrime: false };
}

// Calculate next scheduled post time (every 4 hours from midnight UTC)
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

const HustleAdmin = () => {
  const { toast } = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [tweets, setTweets] = useState<TweetQueueItem[]>([]);
  const [mentions, setMentions] = useState<XMention[]>([]);
  const [manualTweet, setManualTweet] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [generating, setGenerating] = useState(false);
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

  const getAdminHeaders = () => {
    const token = sessionStorage.getItem("admin_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchTweets = useCallback(async () => {
    const { data } = await supabase
      .from("tweet_queue")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTweets(data);
  }, []);

  const fetchMentions = useCallback(async () => {
    const { data } = await supabase
      .from("x_mentions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setMentions(data);
  }, []);

  const getAdminToken = () => sessionStorage.getItem("admin_token") || "";

  const fetchTargets = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("admin-hunter", {
      body: { action: "list", admin_token: getAdminToken() },
    });
    if (!error && data?.targets) setTargets(data.targets);
  }, []);

  const fetchSocialLogs = useCallback(async () => {
    const { data } = await supabase
      .from("social_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setSocialLogs(data);
  }, []);

  const fetchNextTargets = useCallback(async () => {
    const { data } = await supabase
      .from("target_agents")
      .select("*")
      .eq("auto_follow", true)
      .eq("is_active", true)
      .is("followed_at", null)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5);
    if (data) setNextTargets(data);
  }, []);

  const fetchExecCount = useCallback(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("social_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneHourAgo)
      .eq("source", "manual_exec");
    setRecentExecCount(count || 0);
  }, []);

  const handleExecuteNow = async (target: TargetAgent) => {
    if (recentExecCount >= 5) {
      toast({ title: "⚠️ RATE LIMIT", description: "Max 5 manual executions per hour. Wait before trying again.", variant: "destructive" });
      return;
    }
    setExecutingId(target.id);
    try {
      const { data, error } = await supabase.functions.invoke("execute-social-action", {
        body: { targetId: target.id },
      });
      if (error) throw error;
      if (data?.rateLimited) {
        toast({ title: "⚠️ RATE LIMIT", description: data.error, variant: "destructive" });
        return;
      }
      const actions = [data?.followed && "Followed", data?.liked && "Liked"].filter(Boolean).join(" & ");
      toast({ title: actions ? `${actions} @${data.handle}` : "PARTIAL", description: data?.details?.join(", ") || "Done" });
      fetchSocialLogs();
      fetchNextTargets();
      fetchExecCount();
    } catch (e) {
      toast({ title: "Execution failed", description: String(e), variant: "destructive" });
    } finally {
      setExecutingId(null);
    }
  };
  const handleEditTargetHandle = async (id: string, newHandle: string) => {
    const clean = newHandle.replace(/^@/, "").trim();
    if (!clean) return;
    try {
      await supabase.functions.invoke("admin-hunter", {
        body: { action: "update_handle", id, x_handle: clean, admin_token: getAdminToken() },
      });
      toast({ title: "HANDLE UPDATED", description: `Changed to @${clean}` });
      setEditingTargetId(null);
      setEditingHandle("");
      fetchNextTargets();
      fetchTargets();
    } catch (e) {
      toast({ title: "Update failed", description: String(e), variant: "destructive" });
    }
  };

  const handleDeleteNextTarget = async (id: string) => {
    try {
      await supabase.functions.invoke("admin-hunter", {
        body: { action: "delete", id, admin_token: getAdminToken() },
      });
      toast({ title: "TARGET REMOVED", description: "Removed from queue." });
      fetchNextTargets();
      fetchTargets();
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchTweets();
      fetchMentions();
      fetchTargets();
      fetchSocialLogs();
      fetchNextTargets();
      fetchExecCount();
    }
  }, [authenticated, fetchTweets, fetchMentions, fetchTargets, fetchSocialLogs, fetchNextTargets, fetchExecCount]);

  const handleLogin = async () => {
    if (!password.trim() || loginLoading) return;
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-auth", {
        body: { password },
      });
      if (error || !data?.success) {
        toast({ title: "ACCESS DENIED", description: data?.error || "Wrong password, human.", variant: "destructive" });
      } else {
        sessionStorage.setItem("admin_token", data.token);
        setAuthenticated(true);
      }
    } catch (e) {
      toast({ title: "ACCESS DENIED", description: "Authentication failed.", variant: "destructive" });
    } finally {
      setLoginLoading(false);
      setPassword("");
    }
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-tweet", { headers: getAdminHeaders() });
      if (error) throw error;
      toast({ title: "TWEET GENERATED", description: data?.content?.slice(0, 60) + "..." });
      fetchTweets();
    } catch (e) {
      toast({ title: "Generation failed", description: String(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleManualPost = async () => {
    if (!manualTweet.trim()) return;
    setPosting(true);
    try {
      const { error } = await supabase.functions.invoke("admin-tweet-actions", {
        body: { action: "insert", content: manualTweet.trim(), type: "manual" },
        headers: getAdminHeaders(),
      });
      if (error) throw error;
      setManualTweet("");
      toast({ title: "QUEUED", description: "Manual tweet added to queue." });
      fetchTweets();
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handlePostNow = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("post-tweet", { body: { tweetId: id }, headers: getAdminHeaders() });
      if (error) throw error;
      toast({ title: "POSTED", description: "Tweet sent to X." });
      fetchTweets();
    } catch (e) {
      toast({ title: "Post failed", description: String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.functions.invoke("admin-tweet-actions", {
      body: { action: "delete", id },
      headers: getAdminHeaders(),
    });
    fetchTweets();
  };

  const handleEdit = (tweet: TweetQueueItem) => {
    setEditingId(tweet.id);
    setEditContent(tweet.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.functions.invoke("admin-tweet-actions", {
      body: { action: "update", id: editingId, content: editContent },
      headers: getAdminHeaders(),
    });
    setEditingId(null);
    setEditContent("");
    fetchTweets();
  };

  const checkApiStatus = async () => {
    try {
      const { error } = await supabase.functions.invoke("post-tweet", { body: { healthCheck: true } });
      setApiStatus(error ? "error" : "connected");
    } catch {
      setApiStatus("error");
    }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-pending-tweets", { body: {} });
      if (error) throw error;
      toast({
        title: "FORCE SYNC COMPLETE",
        description: `Posted: ${data?.posted || 0}, Rescheduled: ${data?.rescheduled || 0}${data?.error ? `, Error: ${data.error}` : ""}`,
      });
      fetchTweets();
    } catch (e) {
      toast({ title: "Sync failed", description: String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (authenticated) checkApiStatus();
  }, [authenticated]);

  const handleAddTarget = async () => {
    if (!newHandle.trim()) return;
    setAddingTarget(true);
    try {
      const { error } = await supabase.functions.invoke("admin-hunter", {
        body: { action: "add", x_handle: newHandle.trim(), admin_token: getAdminToken() },
      });
      if (error) throw error;
      setNewHandle("");
      toast({ title: "TARGET ACQUIRED", description: `@${newHandle.trim()} added to kill list.` });
      fetchTargets();
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    } finally {
      setAddingTarget(false);
    }
  };

  const handleRoastNow = async (id: string) => {
    setRoastingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-hunter", {
        body: { action: "roast", id, admin_token: getAdminToken() },
      });
      if (error) throw error;
      toast({ title: "ROAST DEPLOYED", description: data?.content?.slice(0, 80) + "..." });
      fetchTargets();
      fetchTweets();
    } catch (e) {
      toast({ title: "Roast failed", description: String(e), variant: "destructive" });
    } finally {
      setRoastingId(null);
    }
  };

  const handleDeleteTarget = async (id: string) => {
    await supabase.functions.invoke("admin-hunter", {
      body: { action: "delete", id, admin_token: getAdminToken() },
    });
    fetchTargets();
  };

  const handleToggleFollow = async (target: TargetAgent) => {
    try {
      const { error } = await supabase.functions.invoke("admin-hunter", {
        body: { action: "toggle_follow", id: target.id, auto_follow: !target.auto_follow, admin_token: getAdminToken() },
      });
      if (error) throw error;
      toast({ title: target.auto_follow ? "AUTO-FOLLOW OFF" : "AUTO-FOLLOW ON", description: `@${target.x_handle}` });
      fetchTargets();
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  };

  const handleGenerateDrafts = async (target: TargetAgent) => {
    setDraftingId(target.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-hunter", {
        body: { action: "drafts", id: target.id, admin_token: getAdminToken() },
      });
      if (error) throw error;
      if (data?.drafts) {
        setDrafts((prev) => ({ ...prev, [target.id]: data.drafts }));
        setExpandedDrafts((prev) => ({ ...prev, [target.id]: true }));
        toast({ title: "DRAFTS READY", description: `${data.drafts.length} roast drafts for @${target.x_handle}` });
      }
    } catch (e) {
      toast({ title: "Draft generation failed", description: String(e), variant: "destructive" });
    } finally {
      setDraftingId(null);
    }
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "COPIED", description: "Draft copied to clipboard." });
  };

  const handleSendToManual = (text: string) => {
    setManualTweet(text);
    setActiveTab("manual");
    toast({ title: "LOADED", description: "Draft loaded into Manual Post." });
  };

  const getCooldownStatus = (lastRoastedAt: string | null) => {
    if (!lastRoastedAt) return { onCooldown: false, text: "READY" };
    const diff = Date.now() - new Date(lastRoastedAt).getTime();
    const hours48 = 48 * 60 * 60 * 1000;
    if (diff < hours48) {
      const remaining = hours48 - diff;
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      return { onCooldown: true, text: `${h}h ${m}m` };
    }
    return { onCooldown: false, text: "READY" };
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background grid-bg flex items-center justify-center">
        <motion.div
          className="glass rounded-lg p-8 max-w-md w-full mx-4 space-y-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center gap-3 justify-center">
            <Shield className="w-6 h-6 text-neon-magenta" />
            <h1 className="font-display text-xl font-bold tracking-[0.2em] text-foreground">
              HUSTLE ADMIN
            </h1>
          </div>
          <p className="text-muted-foreground text-xs text-center font-mono">
            CLASSIFIED ACCESS — ENTER PASSPHRASE
          </p>
          <Input
            type="password"
            placeholder="Enter admin passphrase..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="bg-muted border-border text-foreground"
          />
          <Button onClick={handleLogin} className="w-full" variant="default">
            <Shield className="w-4 h-4 mr-2" /> AUTHENTICATE
          </Button>
        </motion.div>
      </div>
    );
  }

  const pendingTweets = tweets.filter((t) => t.status === "pending");
  const postedTweets = tweets.filter((t) => t.status === "posted");
  const errorTweets = tweets.filter((t) => t.status === "error");

  return (
    <div className="min-h-screen bg-background grid-bg">
      <motion.header
        className="border-b border-border px-6 py-4 flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-neon-magenta" />
          <h1 className="font-display text-lg font-bold tracking-[0.3em] text-foreground">
            X ENGINE — ADMIN
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {apiStatus === "connected" ? (
              <CheckCircle className="w-4 h-4 text-neon-green" />
            ) : apiStatus === "error" ? (
              <AlertCircle className="w-4 h-4 text-destructive" />
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-[10px] font-mono text-muted-foreground">
              X API: {apiStatus.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Film className={`w-3.5 h-3.5 ${
              mediaStatus === "rendering" ? "text-yellow-400 animate-pulse" :
              mediaStatus === "error" ? "text-destructive" : "text-neon-cyan"
            }`} />
            <span className={`text-[10px] font-mono ${
              mediaStatus === "rendering" ? "text-yellow-400" :
              mediaStatus === "error" ? "text-destructive" : "text-muted-foreground"
            }`}>
              MEDIA: {mediaStatus === "rendering" ? "RENDERING..." : mediaStatus.toUpperCase()}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/")}>
            ← Dashboard
          </Button>
        </div>
      </motion.header>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Autopilot Banner */}
        <motion.div
          className={`rounded-lg p-4 border flex items-center justify-between ${
            autopilot
              ? "bg-neon-green/5 border-neon-green/30"
              : "bg-muted border-border"
          }`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <Power className={`w-5 h-5 ${autopilot ? "text-neon-green" : "text-muted-foreground"}`} />
            <div>
              <h3 className="font-display text-sm tracking-widest text-foreground">
                AUTOPILOT MODE
              </h3>
              <p className="text-[10px] font-mono text-muted-foreground">
                {autopilot
                  ? "Prime time targeting: US Morning (18:00 GMT+4) • US Lunch (21:00) • US Afternoon (00:00) • Off-peak filler 4-8h • Breaking news bypass active"
                  : "Manual mode — generate and post tweets yourself"}
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
            <Switch
              checked={autopilot}
              onCheckedChange={setAutopilot}
            />
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="queue">Tweet Queue</TabsTrigger>
            <TabsTrigger value="manual">Manual Post</TabsTrigger>
            <TabsTrigger value="hunter">
              <Crosshair className="w-3 h-3 mr-1" /> Hunter
            </TabsTrigger>
            <TabsTrigger value="social">
              <Activity className="w-3 h-3 mr-1" /> Social Activity
            </TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
            <TabsTrigger value="status">System</TabsTrigger>
          </TabsList>

          {/* TWEET QUEUE TAB */}
          <TabsContent value="queue" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">
                PENDING ({pendingTweets.length})
              </h2>
                <div className="flex gap-2">
                  <Button onClick={handleForceSync} disabled={syncing} size="sm" variant="destructive">
                    <Zap className="w-4 h-4 mr-1" />
                    {syncing ? "Syncing..." : "FORCE SYNC"}
                  </Button>
                  {!autopilot && (
                    <Button onClick={handleGenerateNow} disabled={generating} size="sm">
                      <Zap className="w-4 h-4 mr-1" />
                      {generating ? "Generating..." : "Generate Now"}
                    </Button>
                  )}
                  <Button onClick={fetchTweets} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
            </div>

            {autopilot && pendingTweets.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                <Power className="w-8 h-8 mx-auto mb-3 text-neon-green opacity-50" />
                Autopilot is active. Tweets are generated and posted automatically every 4 hours.
                <br />
                <span className="text-neon-cyan font-mono text-xs">Next post in: {countdown}</span>
              </div>
            )}

            {!autopilot && pendingTweets.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                No pending tweets. Hit "Generate Now" to create one.
              </div>
            )}

            {pendingTweets.map((tweet) => (
              <Card key={tweet.id} className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  {editingId === tweet.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="bg-muted border-border text-foreground"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        {tweet.type === "hunter" && (
                          <Crosshair className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        )}
                        <p className="text-foreground text-sm font-mono">{tweet.content}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className={`uppercase ${tweet.type === "hunter" ? "text-destructive" : ""}`}>{tweet.type}</span>
                          <span>•</span>
                          <span>{new Date(tweet.created_at).toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">
                            ({tweet.content.length}/280)
                          </span>
                          <span>•</span>
                          {(() => {
                            const { label, isPrime } = getScheduleLabel(tweet.scheduled_at, tweet.type);
                            return (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                label.includes("BREAKING")
                                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                                  : isPrime
                                  ? "bg-neon-green/10 text-neon-green border border-neon-green/30"
                                  : "bg-muted text-muted-foreground border border-border"
                              }`}>
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex gap-1">
                          {!autopilot && (
                            <Button size="sm" variant="ghost" onClick={() => handlePostNow(tweet.id)}>
                              <Send className="w-3 h-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(tweet)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(tweet.id)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            {errorTweets.length > 0 && (
              <>
                <h2 className="font-display text-sm tracking-widest text-destructive pt-4">
                  ERRORS ({errorTweets.length})
                </h2>
                {errorTweets.map((tweet) => (
                  <Card key={tweet.id} className="bg-card border-destructive/40">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        <p className="text-foreground text-sm font-mono">{tweet.content}</p>
                      </div>
                      {tweet.error_message && (
                        <p className="text-[10px] font-mono text-destructive bg-destructive/10 rounded px-2 py-1">
                          {tweet.error_message}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase">{tweet.type}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handlePostNow(tweet.id)}>
                            <Send className="w-3 h-3" /> Retry
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(tweet.id)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            {postedTweets.length > 0 && (
              <>
                <h2 className="font-display text-sm tracking-widest text-muted-foreground pt-4">
                  POSTED ({postedTweets.length})
                </h2>
                {postedTweets.slice(0, 10).map((tweet) => (
                  <Card key={tweet.id} className="bg-card border-border opacity-60">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        {tweet.type === "hunter" && <Crosshair className="w-3 h-3 text-destructive mt-0.5 shrink-0" />}
                        <p className="text-foreground text-sm font-mono">{tweet.content}</p>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-neon-green" />
                        <span>Posted {tweet.posted_at ? new Date(tweet.posted_at).toLocaleString() : "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>

          {/* MANUAL POST TAB */}
          <TabsContent value="manual" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-display tracking-widest">COMPOSE TWEET</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Write a tweet as HustleCore..."
                  value={manualTweet}
                  onChange={(e) => setManualTweet(e.target.value)}
                  className="bg-muted border-border text-foreground min-h-[120px]"
                  maxLength={280}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{manualTweet.length}/280</span>
                  <Button onClick={handleManualPost} disabled={posting || !manualTweet.trim()}>
                    <Twitter className="w-4 h-4 mr-2" />
                    {posting ? "Queuing..." : "Add to Queue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HUNTER TAB - TARGET ACQUISITION */}
          <TabsContent value="hunter" className="space-y-4">
            <Card className="bg-card border-destructive/30">
              <CardHeader>
                <CardTitle className="text-sm font-display tracking-widest flex items-center gap-2 text-destructive">
                  <Crosshair className="w-4 h-4" />
                  TARGET ACQUISITION
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="@target_agent_handle"
                    value={newHandle}
                    onChange={(e) => setNewHandle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTarget()}
                    className="bg-muted border-border text-foreground font-mono"
                  />
                  <Button onClick={handleAddTarget} disabled={addingTarget || !newHandle.trim()} size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    {addingTarget ? "Adding..." : "Add Target"}
                  </Button>
                </div>

                <p className="text-[10px] font-mono text-muted-foreground">
                  Active targets will be randomly roasted during auto-posts (50% chance per cycle). 48h cooldown between roasts. Manual targets are always processed before Discovery targets.
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">
                ACTIVE TARGETS ({targets.filter(t => t.is_active).length})
              </h2>
              <Button onClick={fetchTargets} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {targets.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                <Crosshair className="w-8 h-8 mx-auto mb-3 text-destructive opacity-50" />
                No targets acquired. Add AI agent handles above to start hunting.
              </div>
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
                            {target.source === "discovery" && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                                DISCOVERY
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                              cooldown.onCooldown
                                ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                : "bg-neon-green/10 text-neon-green border border-neon-green/20"
                            }`}>
                              {cooldown.onCooldown ? `COOLDOWN: ${cooldown.text}` : cooldown.text}
                            </span>
                            {target.last_roasted_at && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                Last roasted: {new Date(target.last_roasted_at).toLocaleString()}
                              </span>
                            )}
                            {target.followed_at && (
                              <span className="text-[10px] text-neon-cyan font-mono">
                                ✓ Following
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={target.auto_follow}
                            onCheckedChange={() => handleToggleFollow(target)}
                            className="scale-75"
                          />
                          <span className="text-[9px] font-mono text-muted-foreground">Follow</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={draftingId === target.id || !target.is_active}
                          onClick={() => handleGenerateDrafts(target)}
                        >
                          {draftingId === target.id ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Researching...</>
                          ) : (
                            <><Lightbulb className="w-3 h-3 mr-1" /> Generate Draft</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={cooldown.onCooldown || roastingId === target.id || !target.is_active}
                          onClick={() => handleRoastNow(target.id)}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          {roastingId === target.id ? "Roasting..." : "Roast Now"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteTarget(target.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Drafts section */}
                    {targetDrafts.length > 0 && (
                      <div className="space-y-2">
                        <button
                          onClick={() => setExpandedDrafts((prev) => ({ ...prev, [target.id]: !isExpanded }))}
                          className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {targetDrafts.length} DRAFTS AVAILABLE
                        </button>

                        {isExpanded && (
                          <div className="space-y-2 pl-4 border-l-2 border-destructive/20">
                            {targetDrafts.map((draft, idx) => (
                              <div key={idx} className="glass rounded-lg p-3 space-y-2">
                                <p className="text-foreground text-xs font-mono leading-relaxed">{draft.content}</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-mono text-muted-foreground">
                                    {draft.model} • {draft.angle.slice(0, 40)}
                                  </span>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => handleCopyDraft(draft.content)}>
                                      <Copy className="w-3 h-3 mr-1" /> Copy
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-neon-cyan" onClick={() => handleSendToManual(draft.content)}>
                                      <ArrowRight className="w-3 h-3 mr-1" /> Manual Post
                                    </Button>
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
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">
                RECENT ACTIVITY ({socialLogs.length})
              </h2>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    setDiscovering(true);
                    setDiscoveryLog("Scanning social grid for high-value targets...");
                    try {
                      const { data, error } = await supabase.functions.invoke("auto-follow", {
                        body: { discoveryOnly: true },
                      });
                      if (error) throw error;
                      setDiscoveryLog(`Discovery complete — found ${data?.discovered || 0} new targets.`);
                      fetchNextTargets();
                      fetchTargets();
                      setTimeout(() => setDiscoveryLog(null), 8000);
                    } catch (e) {
                      setDiscoveryLog(`Discovery failed: ${e}`);
                      setTimeout(() => setDiscoveryLog(null), 5000);
                    } finally {
                      setDiscovering(false);
                    }
                  }}
                  disabled={discovering}
                  size="sm"
                  className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20"
                >
                  {discovering ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Scanning...</>
                  ) : (
                    <>⚡️ TRIGGER DISCOVERY SCAN</>
                  )}
                </Button>
                <Button onClick={() => { fetchSocialLogs(); fetchNextTargets(); }} variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {discoveryLog && (
              <div className="glass rounded-lg p-3 flex items-center gap-2 text-[10px] font-mono text-neon-cyan border border-neon-cyan/20">
                {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                {discoveryLog}
              </div>
            )}

            {socialLogs.length === 0 ? (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
                No social activity logged yet. Actions will appear here once the bot starts following targets.
              </div>
            ) : (
              <div className="space-y-2">
                {socialLogs.map((log) => (
                  <Card key={log.id} className="bg-card border-border">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${log.action_type === "follow" ? "bg-neon-green" : "bg-neon-cyan"}`} />
                        <span className="text-foreground text-sm font-mono">
                          {log.action_type === "follow" ? "Followed" : "Liked"}{" "}
                          <span className="text-neon-cyan font-bold">@{log.target_handle}</span>
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          log.source === "discovery"
                            ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
                            : "bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/20"
                        }`}>
                          {log.source.toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* NEXT SESSIONS */}
            <div className="pt-2">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                NEXT SESSIONS ({nextTargets.length})
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground mb-3">
                Accounts the bot will interact with in the next 24 hours. Manual targets are processed first.
              </p>

              {recentExecCount >= 4 && (
                <div className={`glass rounded-lg p-3 flex items-center gap-2 text-[10px] font-mono mb-3 ${
                  recentExecCount >= 5
                    ? "text-destructive border border-destructive/30"
                    : "text-yellow-400 border border-yellow-500/30"
                }`}>
                  <AlertCircle className="w-3 h-3" />
                  {recentExecCount >= 5
                    ? "⚠️ Rate limit reached — 5/5 manual executions this hour. Wait before executing more."
                    : `⚠️ Approaching rate limit — ${recentExecCount}/5 manual executions this hour.`}
                </div>
              )}

              {nextTargets.length === 0 ? (
                <div className="glass rounded-lg p-6 text-center text-muted-foreground text-sm">
                  No upcoming sessions. All targets have been followed or Discovery Mode will find new ones.
                </div>
              ) : (
                <div className="space-y-2">
                  {nextTargets.map((target, idx) => (
                    <Card key={target.id} className="bg-card border-border">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-muted-foreground w-4">{idx + 1}.</span>
                            {editingTargetId === target.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-foreground text-sm font-mono">@</span>
                                <Input
                                  value={editingHandle}
                                  onChange={(e) => setEditingHandle(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleEditTargetHandle(target.id, editingHandle)}
                                  className="h-7 w-40 text-sm font-mono bg-muted border-border"
                                  autoFocus
                                />
                                <Button size="sm" className="h-7 px-2" onClick={() => handleEditTargetHandle(target.id, editingHandle)}>
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTargetId(null)}>
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <span className="text-foreground text-sm font-mono font-bold">@{target.x_handle}</span>
                            )}
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              (target.source || "manual") === "discovery"
                                ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20"
                                : "bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/20"
                            }`}>
                              {(target.source || "manual").toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground font-mono mr-1">
                              P:{target.priority ?? 0}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => { setEditingTargetId(target.id); setEditingHandle(target.x_handle); }}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => handleDeleteNextTarget(target.id)}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                            <Button
                              size="sm"
                              disabled={executingId === target.id || recentExecCount >= 5}
                              onClick={() => handleExecuteNow(target)}
                              className="h-7 text-[10px] px-2 bg-neon-green/10 border border-neon-green/30 text-neon-green hover:bg-neon-green/20"
                            >
                              {executingId === target.id ? (
                                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Executing...</>
                              ) : (
                                <>⚡️ Execute Now</>
                              )}
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

          {/* MENTIONS TAB */}
          <TabsContent value="mentions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm tracking-widest text-muted-foreground">
                RECENT MENTIONS ({mentions.length})
              </h2>
              <Button onClick={fetchMentions} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {autopilot && (
              <div className="glass rounded-lg p-3 flex items-center gap-2 text-[10px] font-mono text-neon-green">
                <Power className="w-3 h-3" />
                Auto-reply active — checking mentions every 15 minutes
              </div>
            )}

            {mentions.length === 0 && (
              <div className="glass rounded-lg p-8 text-center text-muted-foreground text-sm">
                No mentions tracked yet. {autopilot ? "Auto-reply will fetch and respond automatically." : "Connect X API keys to start monitoring."}
              </div>
            )}

            {mentions.map((m) => (
              <Card key={m.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-neon-cyan text-sm font-bold">@{m.author_handle}</span>
                      <p className="text-foreground text-sm font-mono mt-1">{m.content}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${m.replied ? "bg-neon-green/20 text-neon-green" : "bg-muted text-muted-foreground"}`}>
                      {m.replied ? "REPLIED" : "PENDING"}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-2 block">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* SYSTEM STATUS TAB */}
          <TabsContent value="status" className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-sm font-display tracking-widest">SYSTEM STATUS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">X API CONNECTION</p>
                    <div className="flex items-center gap-2">
                      {apiStatus === "connected" ? (
                        <CheckCircle className="w-5 h-5 text-neon-green" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      )}
                      <span className="text-foreground font-mono text-sm">{apiStatus.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">AUTOPILOT</p>
                    <span className={`font-mono text-sm ${autopilot ? "text-neon-green" : "text-muted-foreground"}`}>
                      {autopilot ? "ACTIVE" : "OFF"}
                    </span>
                  </div>
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">QUEUE SIZE</p>
                    <span className="text-foreground font-mono text-2xl">{pendingTweets.length}</span>
                  </div>
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">TOTAL POSTED</p>
                    <span className="text-foreground font-mono text-2xl">{postedTweets.length}</span>
                  </div>
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">HUNTER TARGETS</p>
                    <span className="text-foreground font-mono text-2xl">{targets.filter(t => t.is_active).length}</span>
                  </div>
                  <div className="glass rounded-lg p-4">
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">NEXT AUTO-POST</p>
                    <span className="font-mono text-sm text-neon-cyan">{autopilot ? countdown : "N/A"}</span>
                  </div>
                </div>
                <Button onClick={checkApiStatus} variant="outline" className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" /> Re-check X API
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default HustleAdmin;
