import { FC, useCallback, useMemo } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/hooks/useCustomWalletModal";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet } from "lucide-react";

const CustomWalletModal: FC = () => {
  const { wallets, select } = useWallet();
  const { visible, setVisible } = useCustomWalletModal();

  const [installed, notInstalled] = useMemo(() => {
    const inst: typeof wallets = [];
    const notInst: typeof wallets = [];
    for (const w of wallets) {
      if (w.readyState === WalletReadyState.Installed) {
        inst.push(w);
      } else {
        notInst.push(w);
      }
    }
    return [inst, notInst];
  }, [wallets]);

  const allWallets = installed.length ? [...installed, ...notInstalled] : notInstalled;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleSelect = useCallback(
    (walletName: string) => {
      const wallet = wallets.find((w) => w.adapter.name === walletName);
      const isInstalled = wallet?.readyState === WalletReadyState.Installed;

      // On mobile, if wallet is not detected (no browser extension), use deep link
      if (isMobile && !isInstalled) {
        const currentUrl = encodeURIComponent(window.location.href);
        if (walletName.toLowerCase().includes("phantom")) {
          // Opens the current page inside Phantom's in-app browser
          window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
        } else if (walletName.toLowerCase().includes("solflare")) {
          window.location.href = `https://solflare.com/ul/v1/browse/${currentUrl}`;
        } else {
          // Fallback: just select and hope adapter handles it
          select(walletName as any);
        }
        setVisible(false);
        return;
      }

      select(walletName as any);
      setVisible(false);
    },
    [select, setVisible, wallets, isMobile]
  );

  const onClose = useCallback(() => setVisible(false), [setVisible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 10000 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-5">
              <Wallet className="w-5 h-5 text-neon-cyan" />
              <h2 className="font-display text-base font-bold tracking-wider text-foreground">
                Connect Wallet
              </h2>
            </div>

            <div className="space-y-2">
              {allWallets.map((wallet) => (
                <motion.button
                  key={wallet.adapter.name}
                  className="w-full flex items-center gap-3 rounded-lg border border-border p-3 hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all cursor-pointer"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(wallet.adapter.name)}
                >
                  <img
                    src={wallet.adapter.icon}
                    alt={wallet.adapter.name}
                    className="w-7 h-7 rounded-md"
                  />
                  <span className="font-mono text-sm text-foreground">
                    {wallet.adapter.name}
                  </span>
                  {wallet.readyState === WalletReadyState.Installed && (
                    <span className="ml-auto text-[10px] font-mono text-neon-green">
                      Detected
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CustomWalletModal;
