import { motion } from "framer-motion";
import { VIRTUALS_URL } from "./CountdownBanner";

const TokenStatus = () => {
  return (
    <motion.a
      href={VIRTUALS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="glass rounded-lg px-4 py-3 flex items-center gap-6 text-[10px] font-mono border border-neon-magenta/20 hover:border-neon-magenta/40 transition-colors cursor-pointer block"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="text-muted-foreground tracking-widest">$HCORE TOKEN</span>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Market Cap:</span>
        <span className="text-neon-cyan font-bold">$---</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Bonding Curve:</span>
        <span className="text-neon-magenta font-bold">--%</span>
      </div>
    </motion.a>
  );
};

export default TokenStatus;
