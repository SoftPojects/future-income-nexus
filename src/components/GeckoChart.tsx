import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, ExternalLink, BarChart2 } from "lucide-react";
import { useTokenData } from "@/hooks/useTokenData";

const GeckoChart = () => {
  const { poolAddress, isLoading: tokenLoading } = useTokenData();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const chartUrl = poolAddress
    ? `https://www.geckoterminal.com/base/pools/${poolAddress}?embed=1&light_chart=0&info=0&swaps=0`
    : null;

  const isLoading = tokenLoading && !poolAddress;

  return (
    <motion.div
      className="rounded-lg border border-neon-cyan/20 overflow-hidden"
      style={{
        background: "hsl(230 15% 5% / 0.9)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neon-cyan/10 bg-neon-cyan/5">
        <div className="flex items-center gap-2.5">
          <BarChart2 className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="font-mono text-[10px] tracking-widest text-neon-cyan font-bold uppercase">
            $HCORE / USDC — Base Network
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green" />
            </span>
            <span className="text-[8px] text-neon-green font-bold tracking-widest">LIVE</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] text-muted-foreground/50 tracking-wider hidden sm:block">
            POWERED BY GECKOTERMINAL
          </span>
          {poolAddress && (
            <a
              href={`https://www.geckoterminal.com/base/pools/${poolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan/40 hover:text-neon-cyan transition-colors"
              title="Open on GeckoTerminal"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="relative w-full" style={{ height: "420px" }}>
        {/* Loading state */}
        {(isLoading || (!chartUrl && !iframeLoaded)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-3">
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] font-mono text-neon-cyan tracking-wider">
                    SYNCING POOL DATA...
                  </span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-10 h-10 text-muted-foreground/20 mx-auto" />
                  <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                    AWAITING LIQUIDITY POOL INDEX...
                  </span>
                  <span className="text-[8px] font-mono text-muted-foreground/25">
                    Token may not be indexed on GeckoTerminal yet
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {chartUrl && (
          <iframe
            src={chartUrl}
            title="$HCORE Live Chart — GeckoTerminal"
            className="w-full h-full border-0"
            allow="fullscreen"
            loading="lazy"
            onLoad={() => setIframeLoaded(true)}
          />
        )}
      </div>
    </motion.div>
  );
};

export default GeckoChart;
