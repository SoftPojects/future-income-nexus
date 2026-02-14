import { motion } from "framer-motion";

const TokenStatus = () => {
  return (
    <motion.div
      className="glass rounded-lg px-4 py-3 flex items-center gap-6 text-[10px] font-mono border border-neon-magenta/20"
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
    </motion.div>
  );
};

export default TokenStatus;
