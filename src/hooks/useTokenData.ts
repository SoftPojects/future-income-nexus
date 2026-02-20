import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const BASE_API_URL = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`;
const TOTAL_SUPPLY = 1_000_000_000; // $HCORE fixed total supply
const MIGRATION_MARKET_CAP = 50_000; // Virtuals Protocol migration threshold in USD
const FETCH_INTERVAL_MS = 30_000; // 30 seconds

export interface TokenData {
  marketCap: number | null;
  priceUsd: number | null;
  bondingCurvePercent: number | null;
  priceChangeH24: number | null;
  isLoading: boolean;
  isError: boolean;
  donationsFallback: number | null; // total SOL donated, shown when DEX fails
}

export function formatMarketCap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

async function fetchDonationsFallback(): Promise<number | null> {
  try {
    const { data, error } = await supabase.from("donations").select("amount_sol");
    if (error || !data) return null;
    const total = data.reduce((sum, row) => sum + Number(row.amount_sol ?? 0), 0);
    return total;
  } catch {
    return null;
  }
}

async function fetchDexScreener(): Promise<{ fdv: number; priceUsd: number; priceChangeH24: number } | null> {
  try {
    const url = `${BASE_API_URL}?t=${Date.now()}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Accept": "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`[DEX] HTTP ${res.status} — request failed`);
      return null;
    }
    const json = await res.json();
    console.log("DEX_RESPONSE:", json); // raw API output for debugging

    const pairs: any[] = json?.pairs ?? [];
    if (!pairs.length) {
      console.warn("[DEX] No pairs returned — token may not be listed yet.");
      return null;
    }

    // Strict filter: must match our token address on Base chain
    const filtered = pairs.filter(
      (p) =>
        p.chainId === "base" &&
        p.baseToken?.address?.toLowerCase() === TOKEN_ADDRESS.toLowerCase()
    );

    if (!filtered.length) {
      console.warn("[DEX] No matching Base chain pairs for this token address.");
      return null;
    }

    // Among valid pairs, pick the one with highest liquidity (most active market)
    const best = filtered.reduce((a, b) =>
      Number(b.liquidity?.usd ?? 0) > Number(a.liquidity?.usd ?? 0) ? b : a
    );

    // Parse price from raw string — preserves full decimal precision
    const rawPriceStr = String(best.priceUsd ?? "0");
    const priceUsd = parseFloat(rawPriceStr);

    // Market Cap = price × total supply (no rounding until display layer)
    const calculatedMarketCap = priceUsd * TOTAL_SUPPLY;

    // Use h24 directly from raw string; fall back to h6
    const rawH24 = best.priceChange?.h24;
    const rawH6 = best.priceChange?.h6;
    const priceChangeH24 = parseFloat(String(rawH24 ?? rawH6 ?? "0"));

    console.log(`RAW_PRICE: ${rawPriceStr}, CALCULATED_MCAP: ${calculatedMarketCap}`);
    console.log(`[DEX] pair=${best.dexId} | liquidity=$${best.liquidity?.usd} | 24h=${priceChangeH24}%`);

    return { fdv: calculatedMarketCap, priceUsd, priceChangeH24 };
  } catch (err) {
    console.error("[DEX] Fetch error:", err);
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
    donationsFallback: null,
  });

  const prevThousandRef = useRef<number | null>(null);
  const onMilestoneRef = useRef(onMilestone);
  useEffect(() => { onMilestoneRef.current = onMilestone; }, [onMilestone]);

  const load = useCallback(async () => {
    setData((prev) => ({ ...prev, isLoading: true }));
    const result = await fetchDexScreener();

    if (!result) {
      // DEX failed — load donations as fallback trust signal
      const donated = await fetchDonationsFallback();
      setData((prev) => ({
        ...prev,
        marketCap: null,
        priceUsd: null,
        bondingCurvePercent: null,
        priceChangeH24: null,
        isLoading: false,
        isError: true,
        donationsFallback: donated,
      }));
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
      donationsFallback: null,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { ...data, formatMarketCap, refetch: load };
}
