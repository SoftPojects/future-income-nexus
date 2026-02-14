import { motion } from "framer-motion";
import { Bitcoin, Share2 } from "lucide-react";
import type { AgentState } from "@/hooks/useAgentStateMachine";

interface ActionButtonsProps {
  agentState: AgentState;
  onFeedCrypto: () => void;
  onShareHustle: () => void;
}

const ActionButtons = ({ agentState, onFeedCrypto, onShareHustle }: ActionButtonsProps) => {
  const isDepleted = agentState === "depleted";

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
      <motion.button
        className="glass glow-magenta rounded-lg px-8 py-4 font-display text-sm font-bold tracking-widest text-neon-magenta border border-neon-magenta/30 flex items-center justify-center gap-3 cursor-pointer"
        whileHover={{
          scale: 1.05,
          boxShadow: "0 0 30px hsl(300 100% 50% / 0.4), 0 0 80px hsl(300 100% 50% / 0.15)",
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400 }}
        onClick={onFeedCrypto}
        animate={isDepleted ? { scale: [1, 1.05, 1] } : {}}
      >
        <Bitcoin className="w-5 h-5" />
        FEED CRYPTO
      </motion.button>

      <motion.button
        className="glass rounded-lg px-6 py-4 font-display text-sm font-bold tracking-widest text-neon-cyan border border-neon-cyan/20 flex items-center justify-center gap-3 cursor-pointer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400 }}
        onClick={onShareHustle}
      >
        <Share2 className="w-5 h-5" />
        SHARE HUSTLE
      </motion.button>
    </div>
  );
};

export default ActionButtons;
