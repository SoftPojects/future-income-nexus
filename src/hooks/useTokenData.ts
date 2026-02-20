import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOTAL_SUPPLY = 1_000_000_000; // $HCORE fixed total supply
const MIGRATION_MARKET_CAP = 50_000; // Virtuals Protocol migration threshold in USD
const FETCH_INTERVAL_MS = 30_000; // 30 seconds

// If live market cap is below this threshold, prefer the manual override
const LIVE_FLOOR_MCAP = 5_100;

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

async function fetchGeckoTerminal(): Promise<{ fdv: number; priceUsd: number; priceChangeH24: number } | null> {
  try {
    // Use supabase.functions.invoke to avoid CORS issues
    const { data: json, error } = await supabase.functions.invoke("gecko-proxy");

    if (error) {
      console.warn("[GECKO] Proxy error:", error.message);
      return null;
    }

    console.log("[GECKO] Raw response:", json);

    const attrs = json?.data?.attributes;
    if (!attrs) {
      console.warn("[GECKO] No token attributes in response — token may not be indexed yet.");
      return null;
    }

    const priceUsd = parseFloat(attrs.price_usd ?? "0");
    if (!priceUsd || priceUsd <= 0) {
      console.warn("[GECKO] price_usd is zero or missing.");
      return null;
    }

    // Use fdv_usd if available, otherwise market_cap_usd, otherwise calculate
    const rawFdv = attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null;
    const rawMcap = attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null;
    const fdv = (rawFdv && rawFdv > 0) ? rawFdv : (rawMcap && rawMcap > 0) ? rawMcap : priceUsd * TOTAL_SUPPLY;

    // GeckoTerminal returns price_change_percentage as an object with h24 key
    const rawH24 =
      attrs.price_change_percentage?.h24 ??
      attrs.price_change_percentage?.["24h"] ??
      null;
    const priceChangeH24 = rawH24 !== null ? parseFloat(String(rawH24)) : 0;

    console.log(
      `[GECKO] price=$${priceUsd} | fdv=$${fdv} | h24=${priceChangeH24}% | fdv_source=${rawFdv ? "fdv_usd" : rawMcap ? "market_cap_usd" : "calculated"}`
    );

    return { fdv, priceUsd, priceChangeH24 };
  } catch (err) {
    console.error("[GECKO] Fetch error:", err);
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

    // Fetch from GeckoTerminal (primary source)
    const geckoResult = await fetchGeckoTerminal();

    // Decide which source to use:
    // - Prefer GeckoTerminal if available and mcap is above the floor
    // - Fall back to manual override if GeckoTerminal fails or is below floor
    const useLiveData = geckoResult && (!override || geckoResult.fdv >= LIVE_FLOOR_MCAP);

    if (!useLiveData && !override) {
      // Both live data and override are unavailable
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

    if (useLiveData && geckoResult) {
      fdv = geckoResult.fdv;
      priceUsd = geckoResult.priceUsd;
      priceChangeH24 = geckoResult.priceChangeH24;
      console.log("[TOKEN] Using GeckoTerminal data — mcap:", fdv);
    } else {
      // Use manual override as backup
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
