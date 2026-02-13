import { motion } from "framer-motion";

const NeonCube = () => {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative" style={{ perspective: "600px" }}>
        <motion.div
          className="relative w-32 h-32"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: 360, rotateX: [25, 35, 25] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 border-2 border-neon-cyan glow-cyan"
            style={{
              transform: "translateZ(64px)",
              background: "hsl(180 100% 50% / 0.05)",
            }}
          />
          {/* Back */}
          <div
            className="absolute inset-0 border-2 border-neon-cyan"
            style={{
              transform: "translateZ(-64px) rotateY(180deg)",
              background: "hsl(180 100% 50% / 0.05)",
            }}
          />
          {/* Left */}
          <div
            className="absolute inset-0 border-2 border-neon-magenta"
            style={{
              transform: "rotateY(-90deg) translateZ(64px)",
              background: "hsl(300 100% 50% / 0.05)",
            }}
          />
          {/* Right */}
          <div
            className="absolute inset-0 border-2 border-neon-magenta"
            style={{
              transform: "rotateY(90deg) translateZ(64px)",
              background: "hsl(300 100% 50% / 0.05)",
            }}
          />
          {/* Top */}
          <div
            className="absolute inset-0 border-2 border-neon-cyan"
            style={{
              transform: "rotateX(90deg) translateZ(64px)",
              background: "hsl(180 100% 50% / 0.05)",
            }}
          />
          {/* Bottom */}
          <div
            className="absolute inset-0 border-2 border-neon-magenta"
            style={{
              transform: "rotateX(-90deg) translateZ(64px)",
              background: "hsl(300 100% 50% / 0.05)",
            }}
          />
        </motion.div>
      </div>

      <motion.div
        className="text-center"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <h2 className="font-display text-xl font-bold text-neon-cyan text-glow-cyan tracking-widest">
          HUSTLECORE v2.6
        </h2>
        <p className="text-xs text-muted-foreground mt-1 tracking-wider">
          NEURAL ENGINE ONLINE
        </p>
      </motion.div>
    </div>
  );
};

export default NeonCube;
