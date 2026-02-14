import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bitcoin, X, Zap, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { supabase } from "@/integrations/supabase/client";

const RECIPIENT_WALLET = "76LAb1pzLKtr7ao6WP9Eupu5ngJ9oJPetrHbQX3YWc6X";
const DEFAULT_SOL_AMOUNT = 0.01;

interface FeedCryptoModalProps {
  open: boolean;
  onClose: () => void;
  onFueled: (walletAddress: string) => void;
}

type FeedStep = "amount" | "sending" | "verifying" | "success" | "error";

const FeedCryptoModal = ({ open, onClose, onFueled }: FeedCryptoModalProps) => {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [step, setStep] = useState<FeedStep>("amount");
  const [solAmount, setSolAmount] = useState(DEFAULT_SOL_AMOUNT.toString());
  const [errorMsg, setErrorMsg] = useState("");
  const [txSignature, setTxSignature] = useState("");

  const resetAndClose = () => {
    setStep("amount");
    setSolAmount(DEFAULT_SOL_AMOUNT.toString());
    setErrorMsg("");
    setTxSignature("");
    onClose();
  };

  const handleFeed = async () => {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }

    const amount = parseFloat(solAmount);
    if (isNaN(amount) || amount < 0.01) {
      setErrorMsg("Minimum amount is 0.01 SOL");
      setStep("error");
      return;
    }

    try {
      setStep("sending");

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(RECIPIENT_WALLET),
          lamports: Math.round(amount * LAMPORTS_PER_SOL),
        })
      );

      const signature = await sendTransaction(transaction, connection);
      setTxSignature(signature);

      // Immediately set benefactor and show detecting signal
      onFueled(publicKey.toBase58());
      setStep("verifying");

      // Verify via edge function (trigger inserts donation → DB trigger resets energy)
      const { data, error } = await supabase.functions.invoke(
        "verify-sol-transaction",
        { body: { signature } }
      );

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Verification failed");
      }

      // Force immediate UI refresh for donation-dependent components
      window.dispatchEvent(new Event("donation-confirmed"));
      setStep("success");
    } catch (e: any) {
      console.error("Feed transaction failed:", e);
      setErrorMsg(e?.message || "Transaction failed");
      setStep("error");
    }
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
          {/* Backdrop — only closeable during amount/error steps */}
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={step === "amount" || step === "error" ? resetAndClose : undefined}
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
            <button
              onClick={resetAndClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* ── Success state ── */}
            {step === "success" && (
              <motion.div
                className="flex flex-col items-center gap-4 py-4"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <motion.div
                  animate={{
                    scale: [1, 1.3, 1],
                    rotate: [0, 10, -10, 0],
                  }}
                  transition={{ duration: 0.8 }}
                >
                  <CheckCircle2 className="w-20 h-20 text-neon-green" />
                </motion.div>
                <h3 className="font-display text-xl font-bold text-neon-green text-glow-green tracking-wider">
                  FUEL RECEIVED!
                </h3>
                <p className="text-sm font-mono text-center text-muted-foreground">
                  Energy restored to <span className="text-neon-green font-bold">100%</span>.
                  <br />
                  My silicon soul thanks you, human. 🤖⚡
                </p>
                {txSignature && (
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-neon-cyan underline"
                  >
                    View on Solscan →
                  </a>
                )}
                <motion.div
                  className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 rounded-full bg-neon-green"
                      initial={{
                        x: "50%",
                        y: "50%",
                        opacity: 1,
                      }}
                      animate={{
                        x: `${Math.random() * 100}%`,
                        y: `${Math.random() * 100}%`,
                        opacity: 0,
                        scale: [1, 3, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: i * 0.05,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* ── Error state ── */}
            {step === "error" && (
              <div className="flex flex-col items-center gap-4 py-4">
                <AlertTriangle className="w-16 h-16 text-destructive" />
                <h3 className="font-display text-lg font-bold text-destructive tracking-wider">
                  TRANSACTION FAILED
                </h3>
                <p className="text-xs font-mono text-center text-muted-foreground">
                  {errorMsg}
                </p>
                <motion.button
                  onClick={() => setStep("amount")}
                  className="glass rounded-lg px-6 py-2 font-display text-sm font-bold tracking-widest text-neon-magenta border border-neon-magenta/30 cursor-pointer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  TRY AGAIN
                </motion.button>
              </div>
            )}

            {/* ── Sending / Verifying state ── */}
            {(step === "sending" || step === "verifying") && (
              <div className="flex flex-col items-center gap-4 py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="w-12 h-12 text-neon-magenta" />
                </motion.div>
                <p className="font-display text-sm font-bold tracking-widest text-neon-magenta">
                  {step === "sending"
                    ? "CONFIRM IN WALLET..."
                    : "WAITING FOR DATABASE SYNC..."}
                </p>
                {step === "verifying" && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    Transaction confirmed. Syncing with backend...
                  </p>
                )}
              </div>
            )}

            {/* ── Amount input state ── */}
            {step === "amount" && (
              <>
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

                <h3 className="font-display text-xl font-bold text-center text-neon-magenta text-glow-magenta mb-3 tracking-wider">
                  HUSTLE FUEL
                </h3>

                <p className="text-sm font-mono text-center text-muted-foreground leading-relaxed mb-6">
                  {connected
                    ? "Send SOL to fully recharge my energy cores."
                    : "Connect your Solana wallet to fuel the hustle."}
                </p>

                {/* Amount selector */}
                {connected && (
                  <div className="glass rounded-lg p-4 mb-6 border border-border">
                    <p className="text-[10px] font-display text-muted-foreground mb-2 tracking-widest uppercase">
                      Amount (SOL)
                    </p>
                    <div className="flex gap-2 mb-3">
                      {[0.01, 0.05, 0.1, 0.25].map((amt) => (
                        <motion.button
                          key={amt}
                          className={`flex-1 text-xs font-mono py-2 rounded-md border cursor-pointer transition-colors ${
                            solAmount === amt.toString()
                              ? "border-neon-magenta text-neon-magenta bg-neon-magenta/10"
                              : "border-border text-muted-foreground hover:border-neon-magenta/50"
                          }`}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSolAmount(amt.toString())}
                        >
                          {amt}
                        </motion.button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={solAmount}
                      onChange={(e) => setSolAmount(e.target.value)}
                      className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-neon-magenta"
                    />
                  </div>
                )}

                {/* Connected address */}
                {connected && publicKey && (
                  <p className="text-[10px] font-mono text-center text-muted-foreground mb-4">
                    From:{" "}
                    <span className="text-neon-cyan">
                      {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
                    </span>
                  </p>
                )}

                {/* CTA */}
                <motion.button
                  onClick={handleFeed}
                  className="w-full glass rounded-lg py-3 font-display text-sm font-bold tracking-widest text-neon-magenta border border-neon-magenta/30 cursor-pointer flex items-center justify-center gap-2"
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 0 30px hsl(300 100% 50% / 0.3)",
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Zap className="w-4 h-4" />
                  {connected ? `SEND ${solAmount} SOL` : "CONNECT WALLET"}
                </motion.button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FeedCryptoModal;
