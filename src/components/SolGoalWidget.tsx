import { motion } from "framer-motion";
import { Target, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTotalSolDonated } from "@/hooks/useTotalSolDonated";

const GOAL_SOL = 10;

const SolGoalWidget = () => {
  const { totalSol } = useTotalSolDonated();
  const progress = Math.min(100, (totalSol / GOAL_SOL) * 100);
  const goalReached = totalSol >= GOAL_SOL;

  return (
    <motion.div
      className="glass rounded-lg p-4 border border-neon-cyan/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-neon-cyan" />
        <span className="font-display text-[10px] font-bold tracking-widest text-neon-cyan text-glow-cyan">
          PHASE 2 GOAL: {GOAL_SOL} SOL
        </span>
        <Zap className="w-3 h-3 text-yellow-400 ml-auto" />
        <span className="font-mono text-[10px] text-yellow-400">
          {totalSol.toFixed(2)} / {GOAL_SOL} SOL
        </span>
      </div>

      <div className="relative">
        <Progress
          value={progress}
          className="h-3 bg-muted border border-border"
        />
        <div
          className="absolute inset-0 h-3 rounded-full overflow-hidden"
          style={{ width: `${progress}%` }}
        >
          <div className="h-full bg-gradient-to-r from-neon-cyan to-neon-magenta animate-pulse-neon rounded-full" />
        </div>
      </div>

      <p className="text-[9px] font-mono text-muted-foreground mt-2 text-center">
        {goalReached
          ? "🎉 GOAL REACHED — Phase 2 unlocked!"
          : `${(GOAL_SOL - totalSol).toFixed(2)} SOL remaining to unlock Real-World API Integration`}
      </p>
    </motion.div>
  );
};

export default SolGoalWidget;
