import { motion } from "framer-motion";
import { Zap, ExternalLink } from "lucide-react";
import { VIRTUALS_URL } from "./CountdownBanner";

interface TradeHcoreButtonProps {
  size?: "sm" | "lg";
}

const TradeHcoreButton = ({ size = "sm" }: TradeHcoreButtonProps) => {
  const isLg = size === "lg";

  return (
    <motion.a
      href={VIRTUALS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="relative group inline-flex"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="absolute inset-0 rounded-md bg-neon-magenta/20 blur-md group-hover:bg-neon-magenta/40 transition-colors" />
      <div
        className={`relative flex items-center gap-1.5 rounded-md border border-neon-magenta bg-neon-magenta/10 font-mono font-bold text-neon-magenta tracking-wider hover:bg-neon-magenta/20 transition-colors ${
          isLg ? "px-6 py-3 text-sm" : "px-3 py-1.5 text-[10px]"
        }`}
      >
        <Zap className={isLg ? "w-4 h-4" : "w-3 h-3"} />
        TRADE $HCORE
        <ExternalLink className={isLg ? "w-3 h-3" : "w-2.5 h-2.5"} />
      </div>
    </motion.a>
  );
};

export default TradeHcoreButton;
