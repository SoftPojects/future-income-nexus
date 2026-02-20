import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Shield } from "lucide-react";
import { VIRTUALS_URL } from "./CountdownBanner";
import { useTokenData } from "@/hooks/useTokenData";
import { cn } from "@/lib/utils";

interface TokenStatusProps {
  onMilestone?: (marketCap: number) => void;
  onMarketCapChange?: (marketCap: number | null) => void;
  onStatsReady?: (liquidity: number, volume: number) => void;
}

const Shimmer = () => (
  <span className="inline-block w-16 h-4 rounded bg-muted/60 animate-pulse align-middle" />
);

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const TokenStatus = ({ onMilestone, onMarketCapChange, onStatsReady }: TokenStatusProps) => {
  const {
    marketCap,
    priceUsd,
    bondingCurvePercent,
    priceChangeH24,
    liquidityUsd,
    volumeH24Usd,
    isLoading,
    isError,
    donationsFallback,
    isManualOverride,
    formatMarketCap,
    refetch,
  } = useTokenData(onMilestone);

  const [pulse, setPulse] = useState(false);
  const prevMcRef = useRef<number | null>(null);
  const statsLoggedRef = useRef(false);

  useEffect(() => {
    if (marketCap !== null && marketCap !== prevMcRef.current) {
      prevMcRef.current = marketCap;
      onMarketCapChange?.(marketCap);
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(t);
    }
  }, [marketCap, onMarketCapChange]);

  // Fire onStatsReady once when liquidity and volume are available
  useEffect(() => {
    if (!statsLoggedRef.current && liquidityUsd && volumeH24Usd && onStatsReady) {
      statsLoggedRef.current = true;
      onStatsReady(liquidityUsd, volumeH24Usd);
    }
  }, [liquidityUsd, volumeH24Usd, onStatsReady]);

  const isStable = priceChangeH24 !== null && priceChangeH24 > -0.5 && priceChangeH24 < 0.5;
  const isUp = priceChangeH24 !== null && priceChangeH24 >= 0.5;
  const isDown = priceChangeH24 !== null && priceChangeH24 <= -0.5;

  const changeLabel = isStable
    ? "STABLE"
    : `${isUp ? "+" : ""}${priceChangeH24?.toFixed(2) ?? "0.00"}%`;

  const changeClass = cn(
    "text-[9px] font-bold",
    isUp && "text-neon-green",
    isDown && "text-destructive",
    isStable && "text-yellow-400"
  );

  const marketCapClass = cn(
    "font-bold transition-colors duration-700 tabular-nums text-3xl",
    isUp && "text-neon-green drop-shadow-[0_0_8px_hsl(var(--neon-green))]",
    isDown && "text-destructive drop-shadow-[0_0_8px_hsl(var(--destructive))]",
    isStable && "text-yellow-400",
    !isUp && !isDown && !isStable && "text-neon-cyan"
  );

  return (
    <motion.div
      className={cn(
        "rounded-lg p-5 flex flex-col gap-3 h-full border transition-all duration-300",
        pulse
          ? "border-neon-cyan shadow-[0_0_12px_hsl(var(--neon-cyan)/0.5)]"
          : "border-neon-magenta/20 hover:border-neon-magenta/40"
      )}
      style={{
        background: "hsl(230 15% 6% / 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
      whileHover={{ scale: 1.02 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      {/* Header: Label + Status */}
      <div className="flex items-center gap-1.5">
        <span className="font-display text-[10px] tracking-widest text-muted-foreground uppercase">$HCORE TOKEN</span>
        {!isLoading && !isError ? (
          <span className="inline-flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
            </span>
            <span className="text-[9px] text-neon-green font-bold tracking-widest">LIVE</span>
          </span>
        ) : isError ? (
          <span className="inline-flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            <span className="text-[9px] text-destructive font-bold tracking-widest">OFFLINE</span>
          </span>
        ) : null}
        {isManualOverride && !isError && (
          <span className="text-[8px] text-yellow-400 font-bold tracking-wider ml-auto">MANUAL</span>
        )}
      </div>

      {/* Market Cap */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Market Cap</span>
        <div className="flex items-end gap-2">
          {isLoading ? (
            <Shimmer />
          ) : isError || marketCap === null ? (
            <span className="text-muted-foreground/60 font-bold animate-pulse text-2xl">SYNCING...</span>
          ) : (
            <motion.span
              className={marketCapClass}
              key={marketCap}
              initial={{ opacity: 0.6, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              {formatMarketCap(marketCap)}
            </motion.span>
          )}
          {priceChangeH24 !== null && !isLoading && !isError && (
            <span className={cn(changeClass, "mb-1")}>({changeLabel})</span>
          )}
        </div>
        {priceUsd !== null && !isLoading && !isError && (
          <span className="text-[8px] text-muted-foreground/50 tabular-nums">
            Price: ${priceUsd.toFixed(9).replace(/0+$/, "").replace(/\.$/, "")}
          </span>
        )}
      </div>

      {/* Market Stats Grid: Liquidity + Volume */}
      <div className="grid grid-cols-2 gap-2 py-2 border-y border-border/40">
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Liquidity</span>
          {isLoading ? (
            <span className="inline-block w-12 h-3 rounded bg-muted/50 animate-pulse" />
          ) : liquidityUsd && liquidityUsd > 0 ? (
            <motion.span
              className="text-[12px] font-mono font-bold text-neon-cyan tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {formatUsdCompact(liquidityUsd)}
            </motion.span>
          ) : (
            <span className="text-[11px] font-mono text-muted-foreground/40">—</span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] text-muted-foreground uppercase tracking-wider">24h Volume</span>
          {isLoading ? (
            <span className="inline-block w-12 h-3 rounded bg-muted/50 animate-pulse" />
          ) : volumeH24Usd && volumeH24Usd > 0 ? (
            <motion.span
              className="text-[12px] font-mono font-bold text-neon-magenta tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {formatUsdCompact(volumeH24Usd)}
            </motion.span>
          ) : (
            <span className="text-[11px] font-mono text-muted-foreground/40">—</span>
          )}
        </div>
      </div>

      {/* Bonding Curve */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bonding Curve:</span>
        {isLoading ? (
          <Shimmer />
        ) : isError || bondingCurvePercent === null ? (
          <span className="text-neon-magenta font-bold">--%</span>
        ) : (
          <motion.span
            className="text-neon-magenta font-bold tabular-nums"
            key={bondingCurvePercent}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {bondingCurvePercent.toFixed(2)}%
          </motion.span>
        )}
      </div>

      {/* VETTED BY GECKO badge */}
      <span className="flex items-center gap-1 text-[8px] text-neon-green/80 tracking-wider border border-neon-green/25 rounded px-1.5 py-0.5 self-start">
        <Shield className="w-2.5 h-2.5 text-neon-green" />
        VETTED BY GECKO
      </span>

      {/* Donations fallback */}
      {isError && donationsFallback !== null && donationsFallback > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px]">Community Raised:</span>
          <span className="text-neon-cyan font-bold">{donationsFallback.toFixed(3)} SOL</span>
        </div>
      )}

      {/* MIGRATION IMMINENT */}
      {bondingCurvePercent !== null && bondingCurvePercent >= 80 && !isLoading && (
        <motion.span
          className="text-[9px] text-yellow-400 font-bold tracking-wider"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          ⚡ MIGRATION IMMINENT
        </motion.span>
      )}

      {/* Footer */}
      <div className="mt-auto pt-2 flex justify-between items-center">
        <a
          href={VIRTUALS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] text-muted-foreground/50 hover:text-neon-cyan transition-colors tracking-wider"
          onClick={(e) => e.stopPropagation()}
        >
          VIEW ON VIRTUALS ↗
        </a>
        <button
          onClick={() => refetch()}
          className={cn(
            "p-1 rounded text-muted-foreground hover:text-neon-cyan transition-colors",
            isLoading && "animate-spin text-neon-cyan"
          )}
          title="Force refresh"
        >
          <RefreshCw size={10} />
        </button>
      </div>
    </motion.div>
  );
};

export default TokenStatus;
