import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Send, RefreshCw, Trash2, Edit2, Zap, Twitter, Clock, CheckCircle, AlertCircle, Power } from "lucide-react";
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
}

interface XMention {
  id: string;
  author_handle: string;
  content: string;
  replied: boolean;
  created_at: string;
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
  const [autopilot, setAutopilot] = useState(true);

  const [loginLoading, setLoginLoading] = useState(false);
  const nextPost = getNextScheduledPost();
  const countdown = useCountdown(nextPost);

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

  useEffect(() => {
    if (authenticated) {
      fetchTweets();
      fetchMentions();
    }
  }, [authenticated, fetchTweets, fetchMentions]);

  const getAdminHeaders = () => {
    const token = sessionStorage.getItem("admin_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

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

  useEffect(() => {
    if (authenticated) checkApiStatus();
  }, [authenticated]);

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
                  ? "Auto-posting every 4h • Auto-replying every 15m • Fully autonomous"
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

        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="queue">Tweet Queue</TabsTrigger>
            <TabsTrigger value="manual">Manual Post</TabsTrigger>
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
                      <p className="text-foreground text-sm font-mono">{tweet.content}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="uppercase">{tweet.type}</span>
                          <span>•</span>
                          <span>{new Date(tweet.created_at).toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">
                            ({tweet.content.length}/280)
                          </span>
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

            {postedTweets.length > 0 && (
              <>
                <h2 className="font-display text-sm tracking-widest text-muted-foreground pt-4">
                  POSTED ({postedTweets.length})
                </h2>
                {postedTweets.slice(0, 10).map((tweet) => (
                  <Card key={tweet.id} className="bg-card border-border opacity-60">
                    <CardContent className="p-4">
                      <p className="text-foreground text-sm font-mono">{tweet.content}</p>
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
                    <p className="text-[10px] text-muted-foreground tracking-widest mb-1">MENTIONS TRACKED</p>
                    <span className="text-foreground font-mono text-2xl">{mentions.length}</span>
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
