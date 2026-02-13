import { motion } from "framer-motion";
import { DollarSign, Battery, Brain } from "lucide-react";
import { useState, useEffect } from "react";

const StatCards = () => {
  const [totalHustled, setTotalHustled] = useState(14.27);
  const [energy, setEnergy] = useState(73);

  useEffect(() => {
    const interval = setInterval(() => {
      setTotalHustled((prev) => +(prev + Math.random() * 0.08).toFixed(2));
      setEnergy((prev) => Math.max(20, Math.min(100, prev + (Math.random() > 0.5 ? 1 : -1))));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const getEnergyColor = () => {
    if (energy > 60) return "bg-neon-green";
    if (energy > 30) return "bg-yellow-400";
    return "bg-destructive";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Hustled */}
      <motion.div
        className="glass rounded-lg p-6 glow-cyan"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        whileHover={{ scale: 1.02 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-neon-cyan" />
          <span className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">
            Total Hustled
          </span>
        </div>
        <motion.div
          className="font-display text-4xl font-bold text-neon-cyan text-glow-cyan"
          key={totalHustled}
        >
          ${totalHustled.toFixed(2)}
        </motion.div>
        <p className="text-[10px] text-muted-foreground mt-2">+$0.42 last 24h</p>
      </motion.div>

      {/* Energy Level */}
      <motion.div
        className="glass rounded-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.02 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Battery className="w-5 h-5 text-neon-magenta" />
          <span className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">
            Energy Level
          </span>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <span className="font-display text-4xl font-bold text-neon-magenta text-glow-magenta">
            {energy}%
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${getEnergyColor()}`}
            initial={{ width: 0 }}
            animate={{ width: `${energy}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              boxShadow: energy > 60
                ? "0 0 10px hsl(120 100% 50% / 0.5)"
                : energy > 30
                ? "0 0 10px hsl(50 100% 50% / 0.5)"
                : "0 0 10px hsl(0 100% 50% / 0.5)",
            }}
          />
        </div>
      </motion.div>

      {/* Current Strategy */}
      <motion.div
        className="glass rounded-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileHover={{ scale: 1.02 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-neon-cyan" />
          <span className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">
            Current Strategy
          </span>
        </div>
        <p className="font-display text-lg font-bold text-foreground">
          Multi-Vector Arbitrage
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {["LinkedIn", "Crypto", "Micro-tasks"].map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-mono px-2 py-1 rounded border border-border text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default StatCards;
