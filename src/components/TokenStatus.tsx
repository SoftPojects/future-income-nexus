import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { VIRTUALS_URL } from "./CountdownBanner";
import { useTokenData } from "@/hooks/useTokenData";
import { cn } from "@/lib/utils";

interface TokenStatusProps {
  onMilestone?: (marketCap: number) => void;
  onMarketCapChange?: (marketCap: number | null) => void;
}

const Shimmer = () => (
  <span className="inline-block w-12 h-3 rounded bg-muted/60 animate-pulse align-middle" />
);

const TokenStatus = ({ onMilestone, onMarketCapChange }: TokenStatusProps) => {
  const { marketCap, bondingCurvePercent, priceChangeH24, isLoading, isError, formatMarketCap } =
    useTokenData(onMilestone);

  // Bubble market cap up to parent for neural suggestions
  const prevMcRef = useRef<number | null>(null);
  useEffect(() => {
    if (marketCap !== prevMcRef.current) {
      prevMcRef.current = marketCap;
      onMarketCapChange?.(marketCap);
    }
  }, [marketCap, onMarketCapChange]);

  const isUp = priceChangeH24 !== null && priceChangeH24 > 0;
  const isDown = priceChangeH24 !== null && priceChangeH24 < 0;

  const marketCapClass = cn(
    "font-bold transition-colors duration-700",
    isUp && "text-neon-green drop-shadow-[0_0_8px_hsl(var(--neon-green))]",
    isDown && "text-destructive drop-shadow-[0_0_8px_hsl(var(--destructive))]",
    !isUp && !isDown && "text-neon-cyan"
  );

  return (
    <motion.a
      href={VIRTUALS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="glass rounded-lg px-4 py-3 flex items-center gap-6 text-[10px] font-mono border border-neon-magenta/20 hover:border-neon-magenta/40 transition-colors cursor-pointer block flex-wrap"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground tracking-widest">$HCORE TOKEN</span>
        {!isLoading && !isError ? (
          <span className="inline-flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green" />
            </span>
            <span className="text-[9px] text-neon-green font-bold tracking-widest">LIVE</span>
          </span>
        ) : isError ? (
          <span className="text-destructive/60 text-[9px]">OFFLINE</span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Market Cap:</span>
        {isLoading ? (
          <Shimmer />
        ) : isError || marketCap === null ? (
          <span className="text-neon-cyan font-bold">$---</span>
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
        {priceChangeH24 !== null && !isLoading && (
          <span className={cn("text-[9px]", isUp ? "text-neon-green" : isDown ? "text-destructive" : "text-muted-foreground")}>
            ({isUp ? "+" : ""}{priceChangeH24.toFixed(1)}%)
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Bonding Curve:</span>
        {isLoading ? (
          <Shimmer />
        ) : isError || bondingCurvePercent === null ? (
          <span className="text-neon-magenta font-bold">--%</span>
        ) : (
          <motion.span
            className="text-neon-magenta font-bold"
            key={bondingCurvePercent}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {bondingCurvePercent.toFixed(1)}%
          </motion.span>
        )}
      </div>

      {bondingCurvePercent !== null && bondingCurvePercent >= 80 && !isLoading && (
        <motion.span
          className="text-[9px] text-yellow-400 font-bold tracking-wider"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          ⚡ MIGRATION IMMINENT
        </motion.span>
      )}
    </motion.a>
  );
};

export default TokenStatus;
