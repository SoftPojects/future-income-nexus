import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";
import type { AgentState } from "@/hooks/useAgentStateMachine";

interface TerminalProps {
  logs: string[];
  agentState: AgentState;
}

const Terminal = ({ logs, agentState }: TerminalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLineColor = (line: string) => {
    if (line.startsWith("[SUCCESS]")) return "text-neon-green text-glow-green";
    if (line.startsWith("[ALERT]")) return "text-neon-magenta text-glow-magenta";
    return "text-neon-cyan";
  };

  const stateIndicatorColor =
    agentState === "hustling" ? "bg-neon-green" : agentState === "resting" ? "bg-yellow-400" : "bg-muted-foreground";

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden h-full flex flex-col"
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <TerminalIcon className="w-4 h-4 text-neon-cyan" />
        <span className="font-display text-xs font-semibold tracking-widest text-neon-cyan text-glow-cyan">
          LIVE NEURAL LINK
        </span>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground uppercase">
          [{agentState}]
        </span>
        <motion.div
          className={`ml-auto w-2 h-2 rounded-full ${stateIndicatorColor}`}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: agentState === "hustling" ? 0.8 : 2, repeat: Infinity }}
        />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scanline text-xs leading-relaxed"
        style={{ maxHeight: "400px" }}
      >
        {logs.map((line, i) => (
          <motion.div
            key={`${i}-${line}`}
            className={`font-mono ${getLineColor(line)}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-muted-foreground mr-2 text-[10px]">
              {String(i + 1).padStart(3, "0")}
            </span>
            {line}
          </motion.div>
        ))}
        <motion.span
          className="inline-block w-2 h-4 bg-neon-cyan ml-1"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
};

export default Terminal;
