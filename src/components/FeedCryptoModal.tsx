import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bitcoin, Copy, Check, X } from "lucide-react";

const WALLET_ADDRESS = "YOUR_WALLET_HERE";

interface FeedCryptoModalProps {
  open: boolean;
  onClose: () => void;
  onFueled: () => void;
}

const FeedCryptoModal = ({ open, onClose, onFueled }: FeedCryptoModalProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(WALLET_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFuelSimulate = () => {
    onFueled();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="glass glow-magenta rounded-xl p-8 max-w-md w-full relative z-10 border border-neon-magenta/30"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <motion.div
                className="w-16 h-16 rounded-full border-2 border-neon-magenta flex items-center justify-center glow-magenta"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Bitcoin className="w-8 h-8 text-neon-magenta" />
              </motion.div>
            </div>

            {/* Title */}
            <h3 className="font-display text-xl font-bold text-center text-neon-magenta text-glow-magenta mb-3 tracking-wider">
              HUSTLE FUEL
            </h3>

            {/* Message */}
            <p className="text-sm font-mono text-center text-muted-foreground leading-relaxed mb-6">
              My silicon brain needs fuel. Send <span className="text-neon-cyan">$SOL</span> or{" "}
              <span className="text-neon-green">$USDC</span> to help me take over the world.
            </p>

            {/* Wallet Address */}
            <div className="glass rounded-lg p-4 mb-6 border border-border">
              <p className="text-[10px] font-display text-muted-foreground mb-2 tracking-widest uppercase">
                Wallet Address
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-xs font-mono text-neon-cyan break-all">
                  {WALLET_ADDRESS}
                </code>
                <motion.button
                  onClick={handleCopy}
                  className="shrink-0 p-2 rounded-md border border-border hover:border-neon-cyan transition-colors"
                  whileTap={{ scale: 0.9 }}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-neon-green" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </motion.button>
              </div>
              {copied && (
                <motion.p
                  className="text-[10px] text-neon-green mt-2 text-glow-green"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  ✓ Copied to clipboard
                </motion.p>
              )}
            </div>

            {/* Accepted */}
            <div className="flex gap-3 justify-center mb-6">
              {["SOL", "USDC", "ETH", "BTC"].map((coin) => (
                <span
                  key={coin}
                  className="text-[10px] font-mono px-3 py-1 rounded-full border border-border text-muted-foreground"
                >
                  {coin}
                </span>
              ))}
            </div>

            {/* Simulate fuel button */}
            <motion.button
              onClick={handleFuelSimulate}
              className="w-full glass rounded-lg py-3 font-display text-sm font-bold tracking-widest text-neon-magenta border border-neon-magenta/30 cursor-pointer"
              whileHover={{
                scale: 1.02,
                boxShadow: "0 0 30px hsl(300 100% 50% / 0.3)",
              }}
              whileTap={{ scale: 0.98 }}
            >
              ⚡ SIMULATE FUEL (+50 ENERGY)
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FeedCryptoModal;
