import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface CelebrationOverlayProps {
  active: boolean;
  onComplete: () => void;
}

const CONFETTI_COLORS = [
  "hsl(180 100% 50%)",   // cyan
  "hsl(300 100% 50%)",   // magenta
  "hsl(120 100% 50%)",   // green
  "hsl(50 100% 50%)",    // yellow
  "hsl(220 100% 60%)",   // blue
];

const CelebrationOverlay = ({ active, onComplete }: CelebrationOverlayProps) => {
  useEffect(() => {
    if (active) {
      const timer = setTimeout(onComplete, 10000);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Neon flash */}
          <motion.div
            className="fixed inset-0 z-[60] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.1, 0.4, 0] }}
            transition={{ duration: 1.5, times: [0, 0.1, 0.3, 0.5, 1] }}
            style={{
              background: "radial-gradient(circle at center, hsl(180 100% 50% / 0.5), hsl(300 100% 50% / 0.3), transparent 70%)",
            }}
          />

          {/* Confetti particles */}
          <div className="fixed inset-0 z-[61] pointer-events-none overflow-hidden">
            {Array.from({ length: 60 }).map((_, i) => {
              const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
              const startX = Math.random() * 100;
              const endX = startX + (Math.random() - 0.5) * 40;
              const size = Math.random() * 6 + 4;
              const isRect = Math.random() > 0.5;

              return (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${startX}%`,
                    top: -20,
                    width: isRect ? size * 2 : size,
                    height: size,
                    backgroundColor: color,
                    borderRadius: isRect ? 2 : "50%",
                  }}
                  initial={{ y: -20, rotate: 0, opacity: 1 }}
                  animate={{
                    y: "110vh",
                    x: `${(endX - startX)}vw`,
                    rotate: Math.random() * 720 - 360,
                    opacity: [1, 1, 1, 0],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    delay: Math.random() * 0.8,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
              );
            })}
          </div>

          {/* Center text flash */}
          <motion.div
            className="fixed inset-0 z-[62] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 0.8] }}
            transition={{ duration: 3, times: [0, 0.2, 0.7, 1] }}
          >
            <div className="text-center">
              <h2 className="font-display text-4xl md:text-6xl font-bold text-neon-cyan text-glow-cyan tracking-[0.5em] mb-2">
                POWER
              </h2>
              <h2 className="font-display text-4xl md:text-6xl font-bold text-neon-magenta text-glow-magenta tracking-[0.5em]">
                OVERWHELMING
              </h2>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CelebrationOverlay;
