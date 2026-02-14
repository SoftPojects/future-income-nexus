import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Radio, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Tweet {
  id: string;
  content: string;
  posted_at: string | null;
}

const LiveXTransmissions = () => {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTweets = async () => {
    const { data } = await supabase
      .from("tweet_queue")
      .select("id, content, posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(3);
    if (data) setTweets(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTweets();
    const channel = supabase
      .channel("live-tweets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tweet_queue" },
        () => fetchTweets()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden border border-neon-cyan/20"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-neon-cyan/5">
        <Radio className="w-4 h-4 text-neon-cyan animate-pulse" />
        <span className="font-display text-xs font-bold tracking-[0.2em] text-neon-cyan">
          LIVE X TRANSMISSIONS
        </span>
        <span className="ml-auto text-[9px] font-mono text-muted-foreground">
          SATELLITE FEED • ENCRYPTED
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
            <span className="ml-2 text-xs font-mono text-neon-cyan">
              Tuning frequency...
            </span>
          </div>
        ) : tweets.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground text-center py-4">
            No transmissions intercepted yet.
          </p>
        ) : (
          tweets.map((tweet, i) => (
            <motion.div
              key={tweet.id}
              className="glass rounded-md p-3 border border-neon-cyan/10 group hover:border-neon-cyan/30 transition-colors"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-mono text-foreground/90 leading-relaxed flex-1">
                  {tweet.content.length > 200
                    ? tweet.content.slice(0, 200) + "…"
                    : tweet.content}
                </p>
                <a
                  href="https://x.com/hustlecore_ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neon-cyan/50 hover:text-neon-cyan transition-colors shrink-0 mt-0.5"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {tweet.posted_at && (
                <span className="text-[9px] font-mono text-muted-foreground mt-1.5 block">
                  TX {new Date(tweet.posted_at).toLocaleString()} • SIGNAL #{i + 1}
                </span>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Scan line effect */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neon-cyan/30 to-transparent" />
    </motion.div>
  );
};

export default LiveXTransmissions;
