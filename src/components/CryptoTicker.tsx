import { useEffect, useState } from "react";

interface TickerItem {
  symbol: string;
  price: number;
  change24h: number | null;
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,virtual-protocol&vs_currencies=usd&include_24hr_change=true";

function formatTickerPrice(price: number, symbol: string): string {
  if (symbol === "$HCORE") {
    const s = price.toFixed(10);
    return `$${s.replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  if (price >= 10_000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

interface CryptoTickerProps {
  hcorePrice?: number | null;
  hcoreChange?: number | null;
}

const CryptoTicker = ({ hcorePrice, hcoreChange }: CryptoTickerProps) => {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch(COINGECKO_URL, { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const d = await res.json();
        const base: TickerItem[] = [
          { symbol: "BTC", price: d.bitcoin?.usd ?? 0, change24h: d.bitcoin?.usd_24h_change ?? null },
          { symbol: "ETH", price: d.ethereum?.usd ?? 0, change24h: d.ethereum?.usd_24h_change ?? null },
          { symbol: "SOL", price: d.solana?.usd ?? 0, change24h: d.solana?.usd_24h_change ?? null },
          { symbol: "$VIRTUAL", price: d["virtual-protocol"]?.usd ?? 0, change24h: d["virtual-protocol"]?.usd_24h_change ?? null },
        ];
        setItems(base.filter((i) => i.price > 0));
      } catch {}
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Build final display list including HCORE
  const displayItems: TickerItem[] = [
    ...items,
    ...(hcorePrice && hcorePrice > 0
      ? [{ symbol: "$HCORE", price: hcorePrice, change24h: hcoreChange ?? null }]
      : []),
  ];

  if (displayItems.length === 0) return null;

  // Duplicate for seamless loop
  const loopItems = [...displayItems, ...displayItems, ...displayItems];

  return (
    <div
      className="border-t border-neon-green/15 overflow-hidden"
      style={{ background: "hsl(0 0% 0% / 0.95)" }}
    >
      <style>{`
        @keyframes hc-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .hc-ticker-track {
          animation: hc-ticker-scroll 60s linear infinite;
          will-change: transform;
        }
        .hc-ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      <div className="flex items-center select-none">
        {/* LIVE label */}
        <div
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-r border-neon-green/20"
          style={{ background: "hsl(120 100% 50% / 0.05)" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green" />
          </span>
          <span className="text-[8px] font-mono font-bold text-neon-green tracking-widest whitespace-nowrap">LIVE</span>
        </div>

        {/* Scrolling track */}
        <div className="overflow-hidden flex-1">
          <div
            className="hc-ticker-track flex items-center gap-0"
            style={{ width: `${loopItems.length * 180}px` }}
          >
            {loopItems.map((item, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 shrink-0 px-4"
                style={{ minWidth: "180px" }}
              >
                <span className="text-[9px] font-mono font-bold text-neon-green tracking-wider">
                  {item.symbol}
                </span>
                <span className="text-[9px] font-mono text-neon-green/70">
                  {formatTickerPrice(item.price, item.symbol)}
                </span>
                {item.change24h !== null && item.change24h !== 0 && (
                  <span
                    className="text-[8px] font-mono"
                    style={{ color: item.change24h >= 0 ? "hsl(120 100% 50%)" : "hsl(0 84% 60%)" }}
                  >
                    {item.change24h >= 0 ? "▲" : "▼"}
                    {Math.abs(item.change24h).toFixed(2)}%
                  </span>
                )}
                <span className="text-neon-green/15 text-[8px] ml-1">◈</span>
              </span>
            ))}
          </div>
        </div>

        {/* CoinGecko credit */}
        <div className="shrink-0 px-3 py-1.5 border-l border-neon-green/20 hidden sm:block">
          <span className="text-[7px] font-mono text-neon-green/30 tracking-widest whitespace-nowrap">
            DATA BY COINGECKO
          </span>
        </div>
      </div>
    </div>
  );
};

export default CryptoTicker;
