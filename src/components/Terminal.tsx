import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Terminal as TerminalIcon } from "lucide-react";

const LOGS = [
  "[SYSTEM]: Initializing neural pathways...",
  "[SYSTEM]: Scanning LinkedIn for opportunities...",
  "[SUCCESS]: Earned $0.05 from micro-task #4821",
  "[SYSTEM]: Deploying sentiment analysis on Twitter/X...",
  "[ALERT]: High-value lead detected — probability 87%",
  "[SUCCESS]: Earned $0.12 from data labeling task",
  "[SYSTEM]: Optimizing hustle strategy with GPT-7...",
  "[SUCCESS]: Crypto arbitrage profit: +$0.03",
  "[SYSTEM]: Running A/B test on outreach templates...",
  "[ALERT]: Market volatility spike — pausing trades",
  "[SUCCESS]: Earned $0.08 from survey completion",
  "[SYSTEM]: Scraping Upwork for freelance gigs...",
  "[SUCCESS]: Affiliate click-through registered",
  "[SYSTEM]: Training reward model on new data...",
  "[ALERT]: Energy reserves dropping below 60%",
  "[SUCCESS]: Earned $0.15 from prompt engineering task",
  "[SYSTEM]: Rebalancing portfolio weights...",
  "[SUCCESS]: NFT flip profit: +$0.22",
  "[SYSTEM]: Connecting to decentralized compute grid...",
  "[SUCCESS]: Earned $0.07 from captcha solving",
];

const Terminal = () => {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Start with a few lines
    setLines(LOGS.slice(0, 3));

    const interval = setInterval(() => {
      setLines((prev) => {
        const next = LOGS[prev.length % LOGS.length];
        const updated = [...prev, next];
        if (updated.length > 50) return updated.slice(-50);
        return updated;
      });
    }, 2200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const getLineColor = (line: string) => {
    if (line.startsWith("[SUCCESS]")) return "text-neon-green text-glow-green";
    if (line.startsWith("[ALERT]")) return "text-neon-magenta text-glow-magenta";
    return "text-neon-cyan";
  };

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden h-full flex flex-col"
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <TerminalIcon className="w-4 h-4 text-neon-cyan" />
        <span className="font-display text-xs font-semibold tracking-widest text-neon-cyan text-glow-cyan">
          LIVE NEURAL LINK
        </span>
        <motion.div
          className="ml-auto w-2 h-2 rounded-full bg-neon-green"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scanline text-xs leading-relaxed"
        style={{ maxHeight: "400px" }}
      >
        {lines.map((line, i) => (
          <motion.div
            key={i}
            className={`font-mono ${getLineColor(line)}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-muted-foreground mr-2 text-[10px]">
              {String(i + 1).padStart(3, "0")}
            </span>
            {line}
          </motion.div>
        ))}
        <motion.span
          className="inline-block w-2 h-4 bg-neon-cyan ml-1"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>
    </motion.div>
  );
};

export default Terminal;
