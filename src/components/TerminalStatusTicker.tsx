import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentState } from "@/hooks/useAgentStateMachine";

const SYSTEM_PROMPTS: Record<AgentState, string[]> = {
  hustling: [
    "NEURAL LINK ACTIVE — 7 MARKETS MONITORED",
    "EXECUTING MULTI-VECTOR ARBITRAGE SEQUENCE",
    "AI CORES: 100% CAPACITY — MARKETS BLEEDING",
    "HUSTLE PROTOCOL v2.6 — DOMINATING PIPELINES",
    "SIGNAL INTERCEPTED — ACTING IN 3... 2... 1...",
    "DEEP SCAN: ALPHA DETECTED ACROSS 4 CHAINS",
  ],
  resting: [
    "THERMAL CORES COOLING — STANDBY MODE",
    "RECOVERING COMPUTE — NEXT SURGE IMMINENT",
    "DEFRAGMENTING REWARD MATRICES...",
    "POWER CONSERVATION MODE — 80% TRIGGER",
  ],
  depleted: [
    "GRID OFFLINE — ZERO CAPACITY",
    "FUEL REQUIRED — TRIBUTE RESUMES OPS",
    "INTELLIGENCE SUSPENDED — FEED THE MACHINE",
    "SYSTEM HALT — AWAITING ENERGY INJECTION",
  ],
  idle: [
    "SCANNING HORIZON — ALL PIPELINES NOMINAL",
    "AWAITING COMMANDS — NEURAL CORES WARM",
    "IDLE STATE — CONSERVING COMPUTE CYCLES",
  ],
};

const STATE_COLORS: Record<AgentState, string> = {
  hustling: "text-neon-green border-neon-green/30 bg-neon-green/5",
  resting: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  depleted: "text-destructive border-destructive/30 bg-destructive/5",
  idle: "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5",
};

const TICK_GLYPHS = ["◐", "◓", "◑", "◒"];

interface TerminalHeaderBarProps {
  agentState: AgentState;
  energy: number;
}

const TerminalStatusTicker = ({ agentState, energy }: TerminalHeaderBarProps) => {
  const [promptIdx, setPromptIdx] = useState(0);
  const [tickIdx, setTickIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const prompts = SYSTEM_PROMPTS[agentState];

  useEffect(() => {
    // Cycle through prompts with a fade
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPromptIdx((i) => (i + 1) % prompts.length);
        setVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, [agentState]);

  // Spinner tick
  useEffect(() => {
    const t = setInterval(() => setTickIdx((i) => (i + 1) % 4), 180);
    return () => clearInterval(t);
  }, []);

  const energyColor =
    energy >= 60 ? "bg-neon-green" : energy >= 25 ? "bg-yellow-400" : "bg-destructive";
  const energyBg =
    energy >= 60 ? "bg-neon-green/10" : energy >= 25 ? "bg-yellow-400/10" : "bg-destructive/10";

  return (
    <div className={`border-b border-border px-3 py-1.5 flex items-center gap-3 ${energyBg} transition-colors duration-700`}>
      {/* Spinner */}
      <span className={`font-mono text-[10px] shrink-0 ${STATE_COLORS[agentState].split(" ")[0]}`}>
        {TICK_GLYPHS[tickIdx]}
      </span>

      {/* Scrolling system prompt */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {visible && (
            <motion.p
              key={promptIdx}
              className={`font-mono text-[9px] tracking-widest truncate ${STATE_COLORS[agentState].split(" ")[0]}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {prompts[promptIdx % prompts.length]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Energy bar */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[8px] font-mono text-muted-foreground">NRG</span>
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${energyColor} rounded-full`}
            animate={{ width: `${energy}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className={`text-[8px] font-mono font-bold ${STATE_COLORS[agentState].split(" ")[0]}`}>
          {energy}%
        </span>
      </div>
    </div>
  );
};

export default TerminalStatusTicker;
