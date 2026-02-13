import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Twitter } from "lucide-react";
import type { AgentState } from "@/hooks/useAgentStateMachine";

interface ShareHustleModalProps {
  open: boolean;
  onClose: () => void;
  totalHustled: number;
  energy: number;
  agentState: AgentState;
  strategy: string;
}

const ShareHustleModal = ({ open, onClose, totalHustled, energy, agentState, strategy }: ShareHustleModalProps) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const shareText = `My @HustleCore agent is out-earning me 🤖⚡\n\n💰 Total Hustled: $${totalHustled.toFixed(2)}\n🔋 Energy: ${energy}%\n🧠 Strategy: ${strategy}\n📊 State: ${agentState.toUpperCase()}\n\nFuel his ego here: ${window.location.href}`;

  const handleShareX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    // Create a canvas from the stat card
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw cyberpunk background
      const gradient = ctx.createLinearGradient(0, 0, 600, 400);
      gradient.addColorStop(0, "#0a0e1a");
      gradient.addColorStop(1, "#0d1117");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 600, 400);

      // Grid
      ctx.strokeStyle = "rgba(0, 255, 255, 0.05)";
      for (let i = 0; i < 600; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 400); ctx.stroke();
      }
      for (let i = 0; i < 400; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(600, i); ctx.stroke();
      }

      // Border glow
      ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 580, 380);

      // Title
      ctx.font = "bold 28px 'Orbitron', monospace";
      ctx.fillStyle = "#00ffff";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 20;
      ctx.textAlign = "center";
      ctx.fillText("HUSTLECORE", 300, 60);

      ctx.shadowBlur = 0;
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#666";
      ctx.fillText("AI AGENT DASHBOARD — 2026", 300, 85);

      // Stats
      ctx.textAlign = "left";
      ctx.font = "bold 14px 'Orbitron', monospace";
      ctx.fillStyle = "#00ffff";
      ctx.fillText("TOTAL HUSTLED", 40, 140);
      ctx.font = "bold 48px 'Orbitron', monospace";
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 15;
      ctx.fillText(`$${totalHustled.toFixed(2)}`, 40, 195);

      ctx.shadowBlur = 0;
      ctx.font = "bold 14px 'Orbitron', monospace";
      ctx.fillStyle = "#ff00ff";
      ctx.fillText("ENERGY", 40, 245);
      // Energy bar
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(40, 255, 520, 20);
      const barColor = energy > 60 ? "#00ff00" : energy > 30 ? "#ffcc00" : "#ff4444";
      ctx.fillStyle = barColor;
      ctx.shadowColor = barColor;
      ctx.shadowBlur = 10;
      ctx.fillRect(40, 255, (energy / 100) * 520, 20);

      ctx.shadowBlur = 0;
      ctx.font = "bold 14px 'Orbitron', monospace";
      ctx.fillStyle = "#00ffff";
      ctx.fillText("STRATEGY", 40, 315);
      ctx.font = "18px 'Orbitron', monospace";
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(strategy, 40, 340);

      ctx.font = "bold 12px 'Orbitron', monospace";
      ctx.fillStyle = agentState === "depleted" ? "#ff4444" : "#00ff00";
      ctx.textAlign = "right";
      ctx.fillText(`STATE: ${agentState.toUpperCase()}`, 560, 375);

      // Download
      const link = document.createElement("a");
      link.download = "hustlecore-stats.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Fallback: just share on X
      handleShareX();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            className="glass glow-cyan rounded-xl p-8 max-w-lg w-full relative z-10 border border-neon-cyan/30"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-display text-xl font-bold text-center text-neon-cyan text-glow-cyan mb-6 tracking-wider">
              SHARE YOUR HUSTLE
            </h3>

            {/* Preview Card */}
            <div
              ref={cardRef}
              className="glass rounded-lg p-6 mb-6 border border-border space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold text-neon-cyan tracking-widest">HUSTLECORE</span>
                <span className={`text-[10px] font-mono font-bold uppercase ${agentState === "depleted" ? "text-destructive" : "text-neon-green"}`}>
                  {agentState}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-display tracking-widest mb-1">TOTAL HUSTLED</p>
                <p className="font-display text-3xl font-bold text-neon-cyan text-glow-cyan">${totalHustled.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-display tracking-widest mb-1">ENERGY</p>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${energy > 60 ? "bg-neon-green" : energy > 30 ? "bg-yellow-400" : "bg-destructive"}`}
                    style={{ width: `${energy}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-display tracking-widest mb-1">STRATEGY</p>
                <p className="font-display text-sm font-bold text-foreground">{strategy}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <motion.button
                onClick={handleShareX}
                className="flex-1 glass rounded-lg py-3 font-display text-sm font-bold tracking-widest text-foreground border border-border flex items-center justify-center gap-2 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Twitter className="w-4 h-4" />
                SHARE ON X
              </motion.button>

              <motion.button
                onClick={handleDownload}
                className="flex-1 glass rounded-lg py-3 font-display text-sm font-bold tracking-widest text-neon-cyan border border-neon-cyan/30 flex items-center justify-center gap-2 cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Download className="w-4 h-4" />
                DOWNLOAD
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareHustleModal;
