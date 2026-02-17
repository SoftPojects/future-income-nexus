import { motion } from "framer-motion";
import { DollarSign, Battery, Brain, Info } from "lucide-react";
import type { AgentState } from "@/hooks/useAgentStateMachine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StatCardsProps {
  totalHustled: number;
  energy: number;
  agentState: AgentState;
  strategy: { name: string; tags: string[] };
  onVotePhase2: () => void;
}

const StatCards = ({ totalHustled, energy, agentState, strategy, onVotePhase2 }: StatCardsProps) => {
  const getEnergyColor = () => {
    if (energy > 60) return "bg-neon-green";
    if (energy > 30) return "bg-yellow-400";
    return "bg-destructive";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
      {/* Total Hustled */}
      <motion.div
        className="md:col-span-1 lg:col-span-4 glass rounded-lg p-6 glow-cyan"
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
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                Simulated Value Generation. This represents the agent's performance in the Phase 1 Neural Sandbox. Real-world asset integration starts in Phase 2.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <motion.div
          className="font-display text-4xl font-bold text-neon-cyan text-glow-cyan"
          key={totalHustled}
        >
          ${totalHustled.toFixed(2)}
        </motion.div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {agentState === "hustling" ? "🟢 Value Identified (Sandbox Mode)" : agentState === "depleted" ? "☠️ Depleted — counter paused" : agentState === "resting" ? "💤 Resting — counter paused" : "⏸ Idle — counter paused"}
        </p>
        <button
          onClick={onVotePhase2}
          className="mt-3 text-[10px] font-mono font-bold tracking-wider px-3 py-1.5 rounded border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-colors uppercase"
        >
          ⚡ Vote for Phase 2
        </button>
      </motion.div>

      {/* Energy Level */}
      <motion.div
        className="md:col-span-1 lg:col-span-4 glass rounded-lg p-6"
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
        className="md:col-span-2 lg:col-span-4 glass rounded-lg p-6"
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
          {strategy.name}
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {strategy.tags.map((tag) => (
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
