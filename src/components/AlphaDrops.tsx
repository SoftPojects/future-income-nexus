import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Zap, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GLOBAL_CHAT_MODEL, logModelUsage } from "@/lib/ai-models";
import { VIRTUALS_URL } from "./CountdownBanner";
import type { HcoreTokenInfo } from "@/hooks/useHcoreToken";

interface AlphaDropsProps {
  userInfo: HcoreTokenInfo;
}

const PREVIEW_STRATEGIES = [
  "Flash loan arbitrage loop across 3 Solana DEXs — estimated 0.4% per cycle",
  "AI-generated SEO content pipeline reselling at 12x markup to agencies",
  "MEV sandwich detection bot with Jito bundles — avg $47/day passive",
  "Cross-chain bridge fee skimming via automated routing optimization",
  "Sentiment-driven token accumulation 48h before CT hype cycles",
];

const AlphaDrops = ({ userInfo }: AlphaDropsProps) => {
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userInfo.isHolder) return;
    const fetchTips = async () => {
      setLoading(true);
      try {
        logModelUsage("agent-chat (AlphaDrops)", GLOBAL_CHAT_MODEL);
        const { data, error } = await supabase.functions.invoke("agent-chat", {
          body: {
            message: "Give me 3 specific Level 2 hustle tips with numbers and actionable steps",
            tier: "holder",
          },
        });
        if (!error && data?.reply) {
          setTips([data.reply]);
        } else {
          setTips(PREVIEW_STRATEGIES.slice(0, 3));
        }
      } catch {
        setTips(PREVIEW_STRATEGIES.slice(0, 3));
      } finally {
        setLoading(false);
      }
    };
    fetchTips();
  }, [userInfo.isHolder]);

  // ─── Locked state for non-holders ───
  if (!userInfo.isHolder) {
    return (
      <motion.div
        className="glass rounded-lg overflow-hidden relative border border-neon-magenta/20 min-h-[520px]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Blurred preview content */}
        <div className="p-6 space-y-3 filter blur-md select-none pointer-events-none opacity-60">
          {PREVIEW_STRATEGIES.map((s, i) => (
            <div key={i} className="glass rounded-md p-3 border border-neon-magenta/10">
              <p className="text-[10px] font-mono text-neon-magenta/80">{s}</p>
            </div>
          ))}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
          {/* Animated lock icon */}
          <motion.div
            className="relative mb-5"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-16 h-16 rounded-full border-2 border-neon-magenta/40 flex items-center justify-center bg-neon-magenta/5">
              <Lock className="w-7 h-7 text-neon-magenta" />
            </div>
            {/* Rotating ring */}
            <motion.div
              className="absolute inset-[-4px] rounded-full border border-dashed border-neon-magenta/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>

          <h3 className="font-display text-base font-bold text-neon-magenta tracking-[0.15em] mb-2">
            ALPHA DROPS
          </h3>
          <p className="font-display text-[10px] text-neon-cyan tracking-[0.3em] mb-4">
            ◈ CLASSIFIED INTEL ◈
          </p>

          <p className="text-xs text-muted-foreground font-mono text-center max-w-sm leading-relaxed mb-6 px-4">
            UNLOCK THE GRID. The Agent releases 3 secret high-frequency hustle
            strategies, arbitrage loops, and early market alpha every week
            exclusively for <span className="text-neon-magenta font-bold">$HCORE</span> partners.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-3">
            <motion.a
              href={VIRTUALS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <div className="absolute inset-0 rounded-lg bg-neon-magenta/20 blur-md group-hover:bg-neon-magenta/30 transition-colors" />
              <div className="relative flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-neon-magenta bg-background font-mono text-sm font-bold text-neon-magenta tracking-wider hover:bg-neon-magenta/10 transition-colors">
                <Zap className="w-4 h-4" />
                ACQUIRE $HCORE ON VIRTUALS.IO
                <ExternalLink className="w-3 h-3 ml-1" />
              </div>
            </motion.a>

            <motion.a
              href={VIRTUALS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <div className="absolute inset-0 rounded-lg bg-neon-cyan/20 blur-md group-hover:bg-neon-cyan/30 transition-colors" />
              <div className="relative flex items-center gap-2 px-5 py-2 rounded-lg border border-neon-cyan bg-background font-mono text-xs font-bold text-neon-cyan tracking-wider hover:bg-neon-cyan/10 transition-colors">
                <Zap className="w-3 h-3" />
                TRADE $HCORE
                <ExternalLink className="w-3 h-3" />
              </div>
            </motion.a>
          </div>

          <p className="text-[9px] font-mono text-muted-foreground mt-4">
            Hold any amount of $HCORE to gain permanent access
          </p>
        </div>
      </motion.div>
    );
  }

  // ─── Unlocked state for holders ───
  return (
    <motion.div
      className="glass rounded-lg p-6 space-y-4 border border-neon-magenta/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-5 h-5 text-neon-magenta" />
        <h3 className="font-display text-sm font-bold text-neon-magenta tracking-widest">
          ALPHA DROPS — LEVEL 2
        </h3>
        <span className="ml-auto text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/30 rounded px-2 py-0.5">
          ACCESS GRANTED
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-neon-magenta animate-spin" />
          <span className="ml-2 text-xs font-mono text-neon-magenta">
            Decrypting alpha...
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {tips.map((tip, i) => (
            <motion.div
              key={i}
              className="glass rounded-lg p-4 border border-neon-magenta/20"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
            >
              <span className="text-[9px] text-neon-magenta/60 font-mono block mb-1">
                ALPHA DROP #{i + 1}
              </span>
              <p className="text-xs font-mono text-neon-magenta">{tip}</p>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground font-mono text-center pt-2">
        Your $HCORE balance: {userInfo.balance.toLocaleString()} tokens
      </p>
    </motion.div>
  );
};

export default AlphaDrops;
