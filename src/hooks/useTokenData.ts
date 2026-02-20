import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const TOKEN_ADDRESS = "0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
const GECKO_API_URL = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN_ADDRESS}`;
const GECKO_POOLS_URL = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${TOKEN_ADDRESS}/pools?page=1`;
const TOTAL_SUPPLY = 1_000_000_000;
const MIGRATION_MARKET_CAP = 50_000;
const FETCH_INTERVAL_MS = 30_000;
const LIVE_FLOOR_MCAP = 5_100;

export interface TokenData {
  marketCap: number | null;
  priceUsd: number | null;
  bondingCurvePercent: number | null;
  priceChangeH24: number | null;
  liquidityUsd: number | null;
  volumeH24Usd: number | null;
  poolAddress: string | null;
  isLoading: boolean;
  isError: boolean;
  donationsFallback: number | null;
  isManualOverride: boolean;
}

export function formatMarketCap(value: number): string {
  if (value >= 1_000_000) {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1_000_000)}M`;
  }
  if (value >= 50_000) {
    return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 1_000)}K`;
  }
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
    return data.reduce((sum, row) => sum + Number(row.amount_sol ?? 0), 0);
  } catch {
    return null;
  }
}

async function fetchGeckoTerminal(): Promise<{ fdv: number; priceUsd: number; priceChangeH24: number } | null> {
  try {
    const res = await fetch(`${GECKO_API_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Accept": "application/json" },
    });
    if (!res.ok) { console.warn(`[GECKO] HTTP ${res.status}`); return null; }
    const json = await res.json();
    const attrs = json?.data?.attributes;
    if (!attrs) { console.warn("[GECKO] No token attributes"); return null; }
    const priceUsd = parseFloat(attrs.price_usd ?? "0");
    if (!priceUsd || priceUsd <= 0) { console.warn("[GECKO] price_usd is zero"); return null; }
    const rawMcap = attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null;
    const fdv = rawMcap && rawMcap > 0 ? rawMcap : priceUsd * TOTAL_SUPPLY;
    const rawH24 = attrs.price_change_percentage?.h24 ?? attrs.price_change_percentage?.["24h"] ?? null;
    const priceChangeH24 = rawH24 !== null ? parseFloat(String(rawH24)) : 0;
    console.log(`[GECKO] price=$${priceUsd} | fdv=$${fdv} | h24=${priceChangeH24}% | mcap_source=${rawMcap ? "api" : "calculated"}`);
    return { fdv, priceUsd, priceChangeH24 };
  } catch (err) {
    console.error("[GECKO] Fetch error:", err);
    return null;
  }
}

async function fetchGeckoTerminalPools(): Promise<{ poolAddress: string; liquidityUsd: number; volumeH24Usd: number } | null> {
  try {
    const res = await fetch(`${GECKO_POOLS_URL}&t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const pools = json?.data;
    if (!pools || pools.length === 0) return null;
    // Pick the pool with highest liquidity
    const best = pools.reduce((a: any, b: any) => {
      const aLiq = parseFloat(a.attributes?.reserve_in_usd ?? "0");
      const bLiq = parseFloat(b.attributes?.reserve_in_usd ?? "0");
      return bLiq > aLiq ? b : a;
    });
    const poolAddress = best.attributes?.address ?? best.id?.split("_")[1] ?? null;
    const liquidityUsd = parseFloat(best.attributes?.reserve_in_usd ?? "0");
    const volumeH24Usd = parseFloat(best.attributes?.volume_usd?.h24 ?? "0");
    console.log(`[GECKO POOLS] pool=${poolAddress} | liquidity=$${liquidityUsd} | volume24h=$${volumeH24Usd}`);
    return { poolAddress, liquidityUsd, volumeH24Usd };
  } catch (err) {
    console.error("[GECKO POOLS] Fetch error:", err);
    return null;
  }
}

export function useTokenData(onMilestone?: (marketCap: number) => void) {
  const [data, setData] = useState<TokenData>({
    marketCap: null,
    priceUsd: null,
    bondingCurvePercent: null,
    priceChangeH24: null,
    liquidityUsd: null,
    volumeH24Usd: null,
    poolAddress: null,
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

    // Fetch all sources in parallel
    const [override, geckoResult, poolsResult] = await Promise.all([
      fetchManualOverride(),
      fetchGeckoTerminal(),
      fetchGeckoTerminalPools(),
    ]);

    const useLiveData = geckoResult && (!override || geckoResult.fdv >= LIVE_FLOOR_MCAP);

    if (!useLiveData && !override) {
      const donated = await fetchDonationsFallback();
      setData((prev) => ({
        ...prev,
        marketCap: null,
        priceUsd: null,
        bondingCurvePercent: null,
        priceChangeH24: null,
        liquidityUsd: poolsResult?.liquidityUsd ?? null,
        volumeH24Usd: poolsResult?.volumeH24Usd ?? null,
        poolAddress: poolsResult?.poolAddress ?? null,
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
      priceUsd = override!.priceUsd;
      fdv = priceUsd * TOTAL_SUPPLY;
      priceChangeH24 = override!.priceChangeH24;
      isManualOverride = true;
      console.log("[TOKEN] Using MANUAL OVERRIDE — price:", priceUsd, "mcap:", fdv);
    }

    const bondingCurvePercent = Math.min(100, (fdv / MIGRATION_MARKET_CAP) * 100);

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
      liquidityUsd: poolsResult?.liquidityUsd ?? null,
      volumeH24Usd: poolsResult?.volumeH24Usd ?? null,
      poolAddress: poolsResult?.poolAddress ?? null,
      isLoading: false,
      isError: false,
      donationsFallback: null,
      isManualOverride,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, FETCH_INTERVAL_MS);
    const channel = supabase
      .channel("token-override-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings" }, () => {
        console.log("[TOKEN] system_settings changed — reloading...");
        load();
      })
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { ...data, formatMarketCap, refetch: load };
}
