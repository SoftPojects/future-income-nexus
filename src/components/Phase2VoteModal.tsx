import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, ExternalLink, Shield, CheckCircle2 } from "lucide-react";
import { useTotalSolDonated } from "@/hooks/useTotalSolDonated";

interface Phase2VoteModalProps {
  open: boolean;
  onClose: () => void;
  isDonor: boolean;
}

const VOTE_OPTIONS = [
  {
    id: "arbitrage",
    label: "Deep Liquidity Arbitrage",
    description: "Real-time on-chain trading across DEXs, bridges, and lending protocols.",
  },
  {
    id: "social",
    label: "Social Engineering Agent",
    description: "Automated lead-gen, social media management, and growth hacking.",
  },
  {
    id: "auditor",
    label: "Autonomous Code Auditor",
    description: "Earning via bug bounties, smart contract audits, and vulnerability detection.",
  },
] as const;

type VoteId = (typeof VOTE_OPTIONS)[number]["id"];

const Phase2VoteModal = ({ open, onClose, isDonor }: Phase2VoteModalProps) => {
  const [selected, setSelected] = useState<VoteId | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { totalSol } = useTotalSolDonated();

  const handleSubmit = () => {
    if (!selected) return;
    const option = VOTE_OPTIONS.find((o) => o.id === selected)!;
    const tweetText = `I just voted for @hustlecore_ai to activate "${option.label}" in Phase 2. The simulation is ending. 10 SOL goal: ${totalSol.toFixed(2)}/10. Join the grid: https://hustlecoreai.xyz/`;
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`,
      "_blank"
    );
    setSubmitted(true);
  };

  const handleClose = () => {
    onClose();
    // Reset after animation
    setTimeout(() => {
      setSelected(null);
      setSubmitted(false);
    }, 300);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-md glass rounded-xl border border-neon-cyan/30 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg border border-border hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all z-10"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="p-6">
            {/* VIP badge */}
            {isDonor && (
              <motion.div
                className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full border border-accent/40 bg-accent/10 w-fit"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <Shield className="w-3.5 h-3.5 text-accent-foreground" />
                <span className="text-[10px] font-mono font-bold text-accent-foreground tracking-wider">
                  VIP VOTER — SOL CONTRIBUTOR
                </span>
              </motion.div>
            )}

            {/* Title */}
            <h2 className="font-display text-lg font-bold text-neon-cyan tracking-[0.15em] mb-1">
              PHASE 2 PROTOCOL SELECTION
            </h2>
            <p className="text-xs font-mono text-muted-foreground leading-relaxed mb-6">
              Select the primary real-world skill for HustleCore's Phase 2 evolution. Your vote accelerates the transition from sandbox to reality.
            </p>

            {submitted ? (
              /* ── Confirmation state ── */
              <motion.div
                className="flex flex-col items-center py-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <motion.div
                  className="w-16 h-16 rounded-full border-2 border-neon-green/50 bg-neon-green/10 flex items-center justify-center mb-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                >
                  <CheckCircle2 className="w-8 h-8 text-neon-green" />
                </motion.div>
                <p className="font-display text-sm font-bold text-neon-green tracking-wider mb-1">
                  VOTE TRANSMITTED
                </p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Neural connection strengthened.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-6 px-5 py-2 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:border-neon-cyan/40 hover:text-neon-cyan transition-colors"
                >
                  CLOSE
                </button>
              </motion.div>
            ) : (
              /* ── Voting state ── */
              <>
                <div className="space-y-3 mb-6">
                  {VOTE_OPTIONS.map((option, i) => (
                    <motion.button
                      key={option.id}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        selected === option.id
                          ? "border-neon-magenta bg-neon-magenta/10"
                          : "border-border hover:border-neon-magenta/30 bg-card/30"
                      }`}
                      onClick={() => setSelected(option.id)}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Radio indicator */}
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            selected === option.id
                              ? "border-neon-magenta"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {selected === option.id && (
                            <motion.div
                              className="w-2 h-2 rounded-full bg-neon-magenta"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            />
                          )}
                        </div>
                        <div>
                          <p className={`text-sm font-mono font-bold ${selected === option.id ? "text-neon-magenta" : "text-foreground"}`}>
                            {option.label}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Submit button */}
                <motion.button
                  className={`w-full relative group rounded-lg py-3 font-mono text-sm font-bold tracking-wider transition-all ${
                    selected
                      ? "border-2 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 cursor-pointer"
                      : "border-2 border-border text-muted-foreground/50 cursor-not-allowed"
                  }`}
                  onClick={handleSubmit}
                  disabled={!selected}
                  whileTap={selected ? { scale: 0.97 } : undefined}
                >
                  {selected && (
                    <div className="absolute inset-0 rounded-lg bg-neon-cyan/10 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  <span className="relative flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4" />
                    SUBMIT VOTE VIA X
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Phase2VoteModal;
