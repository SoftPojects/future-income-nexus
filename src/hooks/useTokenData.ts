import { useState, useEffect, useRef, useCallback } from "react";

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const API_URL = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`;
const MIGRATION_MARKET_CAP = 50000; // Virtuals Protocol migration threshold in USD
const FETCH_INTERVAL_MS = 60_000; // 60 seconds

export interface TokenData {
  marketCap: number | null;
  priceUsd: number | null;
  bondingCurvePercent: number | null;
  priceChangeH24: number | null;
  isLoading: boolean;
  isError: boolean;
}

function formatMarketCap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

async function fetchTokenData(): Promise<{ fdv: number; priceUsd: number; priceChangeH24: number } | null> {
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const pairs: any[] = json?.pairs ?? [];
    if (!pairs.length) return null;

    // Pick pair with highest liquidity
    const best = pairs.reduce((a, b) =>
      (Number(b.liquidity?.usd ?? 0) > Number(a.liquidity?.usd ?? 0) ? b : a)
    );

    const fdv = Number(best.fdv ?? best.marketCap ?? 0);
    const priceUsd = Number(best.priceUsd ?? 0);
    const priceChangeH24 = Number(best.priceChange?.h24 ?? 0);

    return { fdv, priceUsd, priceChangeH24 };
  } catch {
    return null;
  }
}

export function useTokenData(onMilestone?: (marketCap: number) => void) {
  const [data, setData] = useState<TokenData>({
    marketCap: null,
    priceUsd: null,
    bondingCurvePercent: null,
    priceChangeH24: null,
    isLoading: true,
    isError: false,
  });

  const prevThousandRef = useRef<number | null>(null);
  const onMilestoneRef = useRef(onMilestone);
  useEffect(() => { onMilestoneRef.current = onMilestone; }, [onMilestone]);

  const load = useCallback(async () => {
    const result = await fetchTokenData();

    if (!result) {
      setData((prev) => ({ ...prev, isLoading: false, isError: true }));
      return;
    }

    const { fdv, priceUsd, priceChangeH24 } = result;
    const bondingCurvePercent = Math.min(100, (fdv / MIGRATION_MARKET_CAP) * 100);

    // Milestone detection: crossed a new thousand
    if (fdv > 0) {
      const currentThousand = Math.floor(fdv / 1000);
      if (prevThousandRef.current !== null && currentThousand > prevThousandRef.current) {
        onMilestoneRef.current?.(fdv);
      }
      prevThousandRef.current = currentThousand;
    }

    setData({
      marketCap: fdv,
      priceUsd,
      bondingCurvePercent,
      priceChangeH24,
      isLoading: false,
      isError: false,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { ...data, formatMarketCap };
}
