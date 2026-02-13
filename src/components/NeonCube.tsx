import { motion, AnimatePresence } from "framer-motion";
import type { AgentState } from "@/hooks/useAgentStateMachine";

interface NeonCubeProps {
  sassyMessage: string;
  agentState: AgentState;
}

const NeonCube = ({ sassyMessage, agentState }: NeonCubeProps) => {
  const spinSpeed = agentState === "hustling" ? 4 : agentState === "resting" ? 16 : 10;
  const glowOpacity = agentState === "hustling" ? 0.15 : 0.05;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Sassy Message Bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={sassyMessage}
          className="glass rounded-lg px-4 py-2 max-w-[260px] text-center border border-neon-magenta/30"
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-[11px] font-mono text-neon-magenta text-glow-magenta leading-relaxed">
            "{sassyMessage}"
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Speech triangle */}
      <div
        className="w-0 h-0 -mt-3"
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid hsl(300 100% 50% / 0.3)",
        }}
      />

      {/* 3D Cube */}
      <div className="relative" style={{ perspective: "600px" }}>
        <motion.div
          className="relative w-28 h-28"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: 360, rotateX: [25, 35, 25] }}
          transition={{ duration: spinSpeed, repeat: Infinity, ease: "linear" }}
        >
          {[
            { transform: "translateZ(56px)", border: "border-neon-cyan", glow: "glow-cyan" },
            { transform: "translateZ(-56px) rotateY(180deg)", border: "border-neon-cyan", glow: "" },
            { transform: "rotateY(-90deg) translateZ(56px)", border: "border-neon-magenta", glow: "" },
            { transform: "rotateY(90deg) translateZ(56px)", border: "border-neon-magenta", glow: "" },
            { transform: "rotateX(90deg) translateZ(56px)", border: "border-neon-cyan", glow: "" },
            { transform: "rotateX(-90deg) translateZ(56px)", border: "border-neon-magenta", glow: "" },
          ].map((face, i) => (
            <div
              key={i}
              className={`absolute inset-0 border-2 ${face.border} ${face.glow}`}
              style={{
                transform: face.transform,
                background: `hsl(${i % 2 === 0 ? "180" : "300"} 100% 50% / ${glowOpacity})`,
              }}
            />
          ))}
        </motion.div>
      </div>

      <motion.div
        className="text-center"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <h2 className="font-display text-lg font-bold text-neon-cyan text-glow-cyan tracking-widest">
          HUSTLECORE v2.6
        </h2>
        <p className="text-[10px] text-muted-foreground mt-1 tracking-wider uppercase">
          {agentState === "hustling" ? "⚡ NEURAL ENGINE ACTIVE" : agentState === "resting" ? "💤 RECOVERY MODE" : "● STANDBY"}
        </p>
      </motion.div>
    </div>
  );
};

export default NeonCube;
