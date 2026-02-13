import { motion } from "framer-motion";
import { Zap, Bitcoin } from "lucide-react";

const ActionButtons = () => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <motion.button
        className="glass glow-cyan rounded-lg px-8 py-4 font-display text-sm font-bold tracking-widest text-neon-cyan border border-neon-cyan/30 flex items-center justify-center gap-3 cursor-pointer"
        whileHover={{
          scale: 1.05,
          boxShadow: "0 0 30px hsl(180 100% 50% / 0.4), 0 0 80px hsl(180 100% 50% / 0.15)",
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400 }}
      >
        <Zap className="w-5 h-5" />
        BOOST AGENT
      </motion.button>

      <motion.button
        className="glass glow-magenta rounded-lg px-8 py-4 font-display text-sm font-bold tracking-widest text-neon-magenta border border-neon-magenta/30 flex items-center justify-center gap-3 cursor-pointer"
        whileHover={{
          scale: 1.05,
          boxShadow: "0 0 30px hsl(300 100% 50% / 0.4), 0 0 80px hsl(300 100% 50% / 0.15)",
        }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400 }}
      >
        <Bitcoin className="w-5 h-5" />
        FEED CRYPTO
      </motion.button>
    </div>
  );
};

export default ActionButtons;
