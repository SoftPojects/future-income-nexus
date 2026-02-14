import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

// Placeholder $HCORE token mint address — replace with real one
const HCORE_MINT = new PublicKey("11111111111111111111111111111111");

export type UserTier = "guest" | "wallet" | "holder";

export interface HcoreTokenInfo {
  tier: UserTier;
  balance: number;
  isHolder: boolean;
  displayName: string;
  walletAddress: string | null;
}

export function useHcoreToken(): HcoreTokenInfo {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState(0);
  const [guestId] = useState(() => Math.random().toString(36).substring(2, 6).toUpperCase());

  const checkBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalance(0);
      return;
    }
    try {
      // Check SPL token accounts for $HCORE mint
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: HCORE_MINT,
      });
      const total = tokenAccounts.value.reduce((sum, acc) => {
        const amount = acc.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0;
        return sum + amount;
      }, 0);
      setBalance(total);
    } catch {
      // Token doesn't exist yet or RPC error — default to 0
      setBalance(0);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    checkBalance();
    if (connected) {
      const interval = setInterval(checkBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [connected, checkBalance]);

  const walletAddress = publicKey?.toBase58() ?? null;
  const isHolder = balance > 0;

  let displayName: string;
  let tier: UserTier;

  if (!connected || !walletAddress) {
    displayName = `Guest ${guestId}`;
    tier = "guest";
  } else if (isHolder) {
    displayName = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    tier = "holder";
  } else {
    displayName = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    tier = "wallet";
  }

  return { tier, balance, isHolder, displayName, walletAddress };
}
