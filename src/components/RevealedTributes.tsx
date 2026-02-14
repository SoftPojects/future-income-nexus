import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Scroll } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Donation {
  id: string;
  wallet_address: string;
  amount_sol: number;
  tx_signature: string | null;
  created_at: string;
}

const formatWallet = (addr: string) =>
  addr.length >= 8 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

const RevealedTributes = () => {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecent = async () => {
    const { data } = await supabase
      .from("donations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setDonations(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecent();
    const channel = supabase
      .channel("tributes-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "donations" }, () => fetchRecent())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Scroll className="w-4 h-4 text-neon-cyan" />
          <span className="font-display text-xs font-semibold tracking-widest text-neon-cyan text-glow-cyan">
            REVEALED TRIBUTES
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">LAST 5 DONATIONS</span>
      </div>

      <div className="p-3 space-y-1.5">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
            ))
          : donations.length === 0
          ? (
            <p className="text-center text-muted-foreground font-mono text-xs py-8">
              No tributes recorded yet.
            </p>
          )
          : donations.map((d, i) => (
              <motion.div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className="font-mono text-xs text-foreground tracking-wider flex-1">
                  {formatWallet(d.wallet_address)}
                </span>
                <span className="font-mono text-sm font-bold text-neon-magenta text-glow-magenta">
                  {Number(d.amount_sol).toFixed(4)} SOL
                </span>
                {d.tx_signature && (
                  <a
                    href={`https://solscan.io/tx/${d.tx_signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neon-cyan hover:text-neon-cyan/80 transition-colors"
                    title="View on Solscan"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </motion.div>
            ))}
      </div>
    </motion.div>
  );
};

export default RevealedTributes;
