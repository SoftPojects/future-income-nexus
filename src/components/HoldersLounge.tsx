import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Crown, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GLOBAL_CHAT_MODEL, logModelUsage } from "@/lib/ai-models";
import type { HcoreTokenInfo } from "@/hooks/useHcoreToken";

interface HoldersLoungeProps {
  userInfo: HcoreTokenInfo;
}

const PLACEHOLDER_TIPS = [
  "Arbitrage opportunity detected: RENDER token mispriced across 3 DEXs by 2.3%. Execute within 4 minutes.",
  "Alpha: Upcoming partnership between AI16Z and a major L2 — accumulate before announcement.",
  "Use Jito MEV bundles on Solana to front-run liquidations. Current ROI: ~8% per successful bundle.",
  "Deploy a sentiment analysis bot on CT (Crypto Twitter). Sell signals as a subscription. $500/mo minimum.",
  "Flash loan arb: borrow SOL on Marginfi, swap to JitoSOL on Jupiter, repay — net 0.15% per cycle.",
];

const HoldersLounge = ({ userInfo }: HoldersLoungeProps) => {
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userInfo.isHolder) return;
    const fetchTips = async () => {
      setLoading(true);
      try {
        logModelUsage("agent-chat (HoldersLounge)", GLOBAL_CHAT_MODEL);
        const { data, error } = await supabase.functions.invoke("agent-chat", {
          body: {
            message: "Give me 3 specific Level 2 hustle tips with numbers and actionable steps",
            tier: "holder",
          },
        });
        if (!error && data?.reply) {
          setTips([data.reply]);
        } else {
          setTips(PLACEHOLDER_TIPS.slice(0, 3));
        }
      } catch {
        setTips(PLACEHOLDER_TIPS.slice(0, 3));
      } finally {
        setLoading(false);
      }
    };
    fetchTips();
  }, [userInfo.isHolder]);

  if (!userInfo.isHolder) {
    return (
      <motion.div
        className="glass rounded-lg overflow-hidden relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Blurred preview */}
        <div className="p-6 space-y-4 filter blur-sm select-none pointer-events-none">
          {PLACEHOLDER_TIPS.map((tip, i) => (
            <div key={i} className="glass rounded-lg p-4 border border-yellow-400/20">
              <p className="text-xs font-mono text-yellow-400">{tip}</p>
            </div>
          ))}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Lock className="w-10 h-10 text-yellow-400 mb-4" />
          <h3 className="font-display text-lg font-bold text-yellow-400 mb-2">
            HOLDERS LOUNGE
          </h3>
          <p className="text-xs text-muted-foreground font-mono mb-4 text-center max-w-xs">
            Hold $HCORE tokens to unlock Level 2 Hustle Tips and exclusive alpha.
          </p>
          <motion.a
            href="https://app.virtuals.io"
            target="_blank"
            rel="noopener noreferrer"
            className="glass rounded-lg px-4 py-2 font-mono text-xs text-yellow-400 border border-yellow-400/40 flex items-center gap-2 hover:bg-yellow-400/10 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Crown className="w-4 h-4" />
            Buy $HCORE to Unlock
            <ExternalLink className="w-3 h-3" />
          </motion.a>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="glass rounded-lg p-6 space-y-4 border border-yellow-400/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-yellow-400" />
        <h3 className="font-display text-sm font-bold text-yellow-400 tracking-widest">
          HOLDERS LOUNGE — LEVEL 2
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
          <span className="ml-2 text-xs font-mono text-yellow-400">Loading alpha...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {tips.map((tip, i) => (
            <motion.div
              key={i}
              className="glass rounded-lg p-4 border border-yellow-400/20"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
            >
              <span className="text-[9px] text-yellow-400/60 font-mono block mb-1">
                LEVEL 2 TIP #{i + 1}
              </span>
              <p className="text-xs font-mono text-yellow-400">{tip}</p>
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

export default HoldersLounge;
