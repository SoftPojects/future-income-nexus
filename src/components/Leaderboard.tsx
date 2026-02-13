import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Trophy, Share2, Download, Crown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LeaderboardEntry {
  id: string;
  agent_name: string;
  total_hustled: number;
  is_player: boolean;
  avatar_emoji: string;
}

interface LeaderboardProps {
  playerBalance: number;
  sassyMessage: string;
}

const Leaderboard = ({ playerBalance, sassyMessage }: LeaderboardProps) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    // Sync player balance first
    await supabase
      .from("leaderboard")
      .update({ total_hustled: playerBalance })
      .eq("is_player", true);

    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("total_hustled", { ascending: false })
      .limit(10);

    if (data) setEntries(data as LeaderboardEntry[]);
    setLoading(false);
  }, [playerBalance]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const playerRank = entries.findIndex((e) => e.is_player) + 1;

  const generateHustleCard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 340;
    const ctx = canvas.getContext("2d")!;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 600, 340);
    bg.addColorStop(0, "#0a0a0f");
    bg.addColorStop(0.5, "#0f0f1a");
    bg.addColorStop(1, "#0a0a0f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 600, 340);

    // Border glow
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 15;
    ctx.strokeRect(8, 8, 584, 324);
    ctx.shadowBlur = 0;

    // Top accent line
    const accent = ctx.createLinearGradient(20, 0, 580, 0);
    accent.addColorStop(0, "#00ffff");
    accent.addColorStop(1, "#ff00ff");
    ctx.fillStyle = accent;
    ctx.fillRect(20, 20, 560, 3);

    // Title
    ctx.font = "bold 14px monospace";
    ctx.fillStyle = "#666";
    ctx.fillText("HUSTLECORE // GLOBAL LEADERBOARD", 20, 55);

    // Rank
    ctx.font = "bold 48px monospace";
    ctx.fillStyle = "#ff00ff";
    ctx.shadowColor = "#ff00ff";
    ctx.shadowBlur = 20;
    ctx.fillText(`#${playerRank}`, 20, 115);
    ctx.shadowBlur = 0;

    // Agent name
    ctx.font = "bold 28px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("💎 HustleCore", 140, 110);

    // Balance
    ctx.font = "bold 52px monospace";
    ctx.fillStyle = "#00ffff";
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 20;
    ctx.fillText(`$${playerBalance.toFixed(2)}`, 20, 180);
    ctx.shadowBlur = 0;

    ctx.font = "12px monospace";
    ctx.fillStyle = "#555";
    ctx.fillText("TOTAL HUSTLED", 20, 200);

    // Sassy quote
    ctx.font = "italic 13px monospace";
    ctx.fillStyle = "#ff00ff";
    const quote = `"${sassyMessage.slice(0, 80)}${sassyMessage.length > 80 ? "..." : ""}"`;
    ctx.fillText(quote, 20, 240);

    // Bottom bar
    ctx.fillStyle = "#111";
    ctx.fillRect(20, 270, 560, 50);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 270, 560, 50);

    ctx.font = "11px monospace";
    ctx.fillStyle = "#00ffff";
    ctx.fillText("hustlecore.app", 35, 300);
    ctx.fillStyle = "#555";
    ctx.fillText("•  Autonomous AI Hustle Agent  •  2026", 170, 300);

    // Download
    const link = document.createElement("a");
    link.download = "hustlecore-rank.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const shareToX = () => {
    const text = encodeURIComponent(
      `My @HustleCore agent is ranked #${playerRank} on the Global Leaderboard with $${playerBalance.toFixed(
        2
      )} hustled. "${sassyMessage.slice(0, 60)}..." 🤖⚡`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  };

  const getRankStyle = (rank: number, isPlayer: boolean) => {
    if (isPlayer)
      return "bg-neon-magenta/10 border-neon-magenta/40 glow-magenta";
    if (rank === 1) return "bg-yellow-500/5 border-yellow-500/30";
    if (rank === 2) return "bg-gray-400/5 border-gray-400/20";
    if (rank === 3) return "bg-orange-600/5 border-orange-600/20";
    return "bg-transparent border-border";
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
    if (rank === 2) return <Trophy className="w-4 h-4 text-gray-400" />;
    if (rank === 3) return <Trophy className="w-4 h-4 text-orange-500" />;
    return (
      <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">
        {rank}
      </span>
    );
  };

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-magenta" />
          <span className="font-display text-xs font-semibold tracking-widest text-neon-magenta text-glow-magenta">
            GLOBAL LEADERBOARD
          </span>
        </div>
        {playerRank > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            YOUR RANK: <span className="text-neon-cyan text-glow-cyan">#{playerRank}</span>
          </span>
        )}
      </div>

      {/* Entries */}
      <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-muted/20 animate-pulse"
              />
            ))
          : entries.map((entry, i) => {
              const rank = i + 1;
              return (
                <motion.div
                  key={entry.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${getRankStyle(
                    rank,
                    entry.is_player
                  )}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                >
                  {/* Rank */}
                  <div className="w-6 flex justify-center">{getRankIcon(rank)}</div>

                  {/* Avatar */}
                  <span className="text-lg">{entry.avatar_emoji}</span>

                  {/* Name */}
                  <span
                    className={`flex-1 font-mono text-xs ${
                      entry.is_player
                        ? "text-neon-magenta font-bold text-glow-magenta"
                        : "text-foreground"
                    }`}
                  >
                    {entry.agent_name}
                    {entry.is_player && (
                      <span className="ml-2 text-[9px] text-neon-cyan border border-neon-cyan/30 px-1.5 py-0.5 rounded-full">
                        YOU
                      </span>
                    )}
                  </span>

                  {/* Balance */}
                  <span
                    className={`font-mono text-sm font-bold ${
                      rank === 1
                        ? "text-yellow-400"
                        : entry.is_player
                        ? "text-neon-cyan text-glow-cyan"
                        : "text-muted-foreground"
                    }`}
                  >
                    ${Number(entry.total_hustled).toFixed(2)}
                  </span>

                  {/* Share button for player */}
                  {entry.is_player && (
                    <div className="flex gap-1.5">
                      <motion.button
                        onClick={generateHustleCard}
                        className="p-1.5 rounded border border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan transition-colors"
                        whileTap={{ scale: 0.9 }}
                        title="Download Hustle Card"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </motion.button>
                      <motion.button
                        onClick={shareToX}
                        className="p-1.5 rounded border border-border text-muted-foreground hover:text-neon-magenta hover:border-neon-magenta transition-colors"
                        whileTap={{ scale: 0.9 }}
                        title="Share on X"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  )}
                </motion.div>
              );
            })}
      </div>
    </motion.div>
  );
};

export default Leaderboard;
