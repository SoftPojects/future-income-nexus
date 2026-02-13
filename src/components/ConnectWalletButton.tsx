import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import { Wallet } from "lucide-react";

const ConnectWalletButton = () => {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const truncatedAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  if (connected && publicKey) {
    return (
      <motion.button
        className="glass rounded-lg px-3 py-1.5 font-mono text-[10px] tracking-wider text-neon-green border border-neon-green/30 flex items-center gap-2 cursor-pointer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => disconnect()}
        title="Click to disconnect"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span className="text-glow-green">{truncatedAddress}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      className="glass rounded-lg px-3 py-1.5 font-mono text-[10px] tracking-wider text-neon-magenta border border-neon-magenta/30 flex items-center gap-2 cursor-pointer"
      whileHover={{
        scale: 1.05,
        boxShadow: "0 0 20px hsl(300 100% 50% / 0.3)",
      }}
      whileTap={{ scale: 0.95 }}
      onClick={() => setVisible(true)}
    >
      <Wallet className="w-3.5 h-3.5" />
      CONNECT WALLET
    </motion.button>
  );
};

export default ConnectWalletButton;
