import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const BASE_API_URL = `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`;
const TOTAL_SUPPLY = 1_000_000_000; // $HCORE fixed total supply
const MIGRATION_MARKET_CAP = 50_000; // Virtuals Protocol migration threshold in USD
const FETCH_INTERVAL_MS = 30_000; // 30 seconds

// If DEX market cap is below this threshold, prefer the manual override
const DEX_FLOOR_MCAP = 5_100;

export interface TokenData {
  marketCap: number | null;
  priceUsd: number | null;
  bondingCurvePercent: number | null;
  priceChangeH24: number | null;
  isLoading: boolean;
  isError: boolean;
  donationsFallback: number | null;
  isManualOverride: boolean;
}

// Show full dollars+cents for values under $50K so the display moves visibly
export function formatMarketCap(value: number): string {
  if (value >= 1_000_000) {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1_000_000)}M`;
  }
  if (value >= 50_000) {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1_000)}K`;
  }
  // Below $50K: show full amount with commas and 2 decimal places
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

interface ManualOverride {
  enabled: boolean;
  priceUsd: number;
  priceChangeH24: number;
}

async function fetchManualOverride(): Promise<ManualOverride | null> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["token_override_enabled", "token_override_price", "token_override_change_h24"]);

    if (error || !data || data.length === 0) return null;

    const map: Record<string, string> = {};
    data.forEach((row) => { map[row.key] = row.value; });

    if (map["token_override_enabled"] !== "true") return null;

    const priceUsd = parseFloat(map["token_override_price"] ?? "0");
    const priceChangeH24 = parseFloat(map["token_override_change_h24"] ?? "0");

    if (!priceUsd || priceUsd <= 0) return null;

    return { enabled: true, priceUsd, priceChangeH24 };
  } catch {
    return null;
  }
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
    console.log("DEX_RESPONSE:", json);

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

    // Log every pair for diagnostics
    filtered.forEach((p, i) => {
      console.log(
        `[DEX] pair[${i}]: dex=${p.dexId} | priceUsd=${p.priceUsd} | liquidity=$${p.liquidity?.usd} | h24=${p.priceChange?.h24}%`
      );
    });

    // Pick the pair with HIGHEST LIQUIDITY — the real main trading pool
    const best = filtered.reduce((a, b) =>
      parseFloat(String(b.liquidity?.usd ?? "0")) > parseFloat(String(a.liquidity?.usd ?? "0")) ? b : a
    );

    const rawPrice = String(best.priceUsd ?? "0");
    const mcap = parseFloat(rawPrice) * TOTAL_SUPPLY;

    console.log(`CHOSEN_PAIR_LIQUIDITY: ${best.liquidity?.usd}, PRICE: ${rawPrice}, IS_REAL: true`);
    console.log("CRITICAL_DEBUG_PRICE:", rawPrice);
    console.log("CRITICAL_DEBUG_MCAP:", mcap);

    const rawH24 = best.priceChange?.h24;
    const rawH6  = best.priceChange?.h6;
    const priceChangeH24 = parseFloat(String(rawH24 ?? rawH6 ?? "0"));

    return { fdv: mcap, priceUsd: parseFloat(rawPrice), priceChangeH24 };
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
    isManualOverride: false,
  });

  const prevThousandRef = useRef<number | null>(null);
  const onMilestoneRef = useRef(onMilestone);
  useEffect(() => { onMilestoneRef.current = onMilestone; }, [onMilestone]);

  const load = useCallback(async () => {
    setData((prev) => ({ ...prev, isLoading: true }));

    // Always check for a manual override first (set via Admin panel)
    const override = await fetchManualOverride();

    const dexResult = await fetchDexScreener();

    // Decide which source to use:
    // - Use override if it's enabled AND (DEX failed or DEX mcap is below the floor)
    const useDexData = dexResult && (!override || dexResult.fdv >= DEX_FLOOR_MCAP);

    if (!useDexData && !override) {
      // Both DEX and override are unavailable
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
        isManualOverride: false,
      }));
      return;
    }

    let fdv: number;
    let priceUsd: number;
    let priceChangeH24: number;
    let isManualOverride = false;

    if (useDexData && dexResult) {
      fdv = dexResult.fdv;
      priceUsd = dexResult.priceUsd;
      priceChangeH24 = dexResult.priceChangeH24;
      console.log("[TOKEN] Using DEX data — mcap:", fdv);
    } else {
      // Use manual override
      priceUsd = override!.priceUsd;
      fdv = priceUsd * TOTAL_SUPPLY;
      priceChangeH24 = override!.priceChangeH24;
      isManualOverride = true;
      console.log("[TOKEN] Using MANUAL OVERRIDE — price:", priceUsd, "mcap:", fdv);
    }

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
      isManualOverride,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, FETCH_INTERVAL_MS);

    // Realtime: if system_settings changes (e.g. admin toggles override), reload immediately
    const channel = supabase
      .channel("token-override-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        () => {
          console.log("[TOKEN] system_settings changed via realtime — reloading...");
          load();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { ...data, formatMarketCap, refetch: load };
}
