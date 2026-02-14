import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Supporter {
  wallet_address: string;
  total_sol: number;
}

const formatWallet = (addr: string) =>
  addr.length >= 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

const TopSupporters = () => {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    const { data } = await supabase
      .from("donations")
      .select("wallet_address, amount_sol");

    if (data) {
      const map = new Map<string, number>();
      data.forEach((d) => {
        const cur = map.get(d.wallet_address) ?? 0;
        map.set(d.wallet_address, cur + Number(d.amount_sol));
      });
      const sorted = [...map.entries()]
        .map(([wallet_address, total_sol]) => ({ wallet_address, total_sol }))
        .sort((a, b) => b.total_sol - a.total_sol)
        .slice(0, 10);
      setSupporters(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel("supporters-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "donations" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-yellow-500/5 border-yellow-500/30";
    if (rank === 2) return "bg-gray-400/5 border-gray-400/20";
    if (rank === 3) return "bg-orange-600/5 border-orange-600/20";
    return "bg-transparent border-border";
  };

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-neon-magenta" />
          <span className="font-display text-xs font-semibold tracking-widest text-neon-magenta text-glow-magenta">
            TOP SUPPORTERS
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">HALL OF FAME</span>
      </div>

      <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
            ))
          : supporters.length === 0
          ? (
            <p className="text-center text-muted-foreground font-mono text-xs py-8">
              No supporters yet. Be the first to fuel the machine.
            </p>
          )
          : supporters.map((s, i) => {
              const rank = i + 1;
              return (
                <motion.div
                  key={s.wallet_address}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${getRankStyle(rank)}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="w-6 flex justify-center">
                    {rank <= 3 ? (
                      <Crown className={`w-4 h-4 ${rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-400" : "text-orange-500"}`} />
                    ) : (
                      <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{rank}</span>
                    )}
                  </div>

                  <span className="flex-1 font-mono text-xs text-foreground tracking-wider">
                    {formatWallet(s.wallet_address)}
                  </span>

                  <span className={`font-mono text-sm font-bold ${rank === 1 ? "text-yellow-400" : "text-neon-cyan text-glow-cyan"}`}>
                    {s.total_sol.toFixed(4)} SOL
                  </span>
                </motion.div>
              );
            })}
      </div>
    </motion.div>
  );
};

export default TopSupporters;
