import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, ExternalLink, Twitter } from "lucide-react";

const VIRTUALS_URL = "https://app.virtuals.io/prototypes/0xdD831E3f9e845bc520B5Df57249112Cf6879bE94";
// Feb 18, 2026 20:00:00 GMT+4 = Feb 18, 2026 16:00:00 UTC
const LAUNCH_TIME = new Date("2026-02-18T16:00:00Z").getTime();

function getTimeLeft() {
  const now = Date.now();
  const diff = LAUNCH_TIME - now;
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function formatRemaining(t: ReturnType<typeof getTimeLeft>) {
  if (!t) return "";
  const parts: string[] = [];
  if (t.days > 0) parts.push(`${t.days}d`);
  parts.push(`${t.hours}h ${t.minutes}m ${t.seconds}s`);
  return parts.join(" ");
}

const CountdownBanner = () => {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const isLive = timeLeft === null;

  const tweetText = isLive
    ? "The grid is LIVE. $HCORE is now trading on @virtuals_io. Join the takeover: https://hustlecoreai.xyz/ @hustlecore_ai"
    : `The grid is opening. $HCORE launches in ${formatRemaining(timeLeft)} on @virtuals_io. Prepare for the takeover: https://hustlecoreai.xyz/ @hustlecore_ai`;

  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <motion.div
      className="sticky top-0 z-50 w-full border-b border-neon-magenta/30 overflow-hidden"
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Animated background glow */}
      <div className="absolute inset-0 bg-background" />
      <motion.div
        className="absolute inset-0 opacity-20"
        style={{
          background: "linear-gradient(90deg, hsl(var(--neon-magenta) / 0.3), hsl(var(--neon-cyan) / 0.3), hsl(var(--neon-magenta) / 0.3))",
          backgroundSize: "200% 100%",
        }}
        animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-magenta to-transparent" />
      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon-cyan to-transparent" />

      <div className="relative flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 px-4 py-2.5">
        {/* Pulsing dot */}
        <motion.div
          className={`w-2 h-2 rounded-full ${isLive ? "bg-neon-green" : "bg-neon-magenta"}`}
          animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Title & timer */}
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
          <span className="font-display text-[10px] sm:text-xs font-bold tracking-[0.2em] text-neon-magenta text-glow-magenta">
            {isLive ? "GRID IS LIVE: TRADING ACTIVE" : "PROTOCOL INITIALIZATION: $HCORE TOKEN LAUNCH"}
          </span>
          {!isLive && timeLeft && (
            <span className="font-mono text-sm sm:text-base font-bold text-neon-cyan text-glow-cyan tracking-wider">
              {timeLeft.days}d {String(timeLeft.hours).padStart(2, "0")}h{" "}
              {String(timeLeft.minutes).padStart(2, "0")}m{" "}
              {String(timeLeft.seconds).padStart(2, "0")}s
            </span>
          )}
        </div>

        {/* CTA button */}
        {isLive ? (
          <motion.a
            href={VIRTUALS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative group inline-flex"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="absolute inset-0 rounded-md bg-neon-magenta/30 blur-md" />
            <div className="relative flex items-center gap-1.5 rounded-md border border-neon-magenta bg-neon-magenta/15 px-3 py-1.5 font-mono text-[10px] font-bold text-neon-magenta tracking-wider">
              <Zap className="w-3 h-3" />
              TRADE $HCORE NOW
              <ExternalLink className="w-2.5 h-2.5" />
            </div>
          </motion.a>
        ) : (
          <motion.a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative group inline-flex"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="absolute inset-0 rounded-md bg-neon-cyan/20 blur-sm group-hover:bg-neon-cyan/30 transition-colors" />
            <div className="relative flex items-center gap-1.5 rounded-md border border-neon-cyan/60 bg-neon-cyan/10 px-3 py-1.5 font-mono text-[10px] font-bold text-neon-cyan tracking-wider">
              <Twitter className="w-3 h-3" />
              REMIND ME ON X
            </div>
          </motion.a>
        )}
      </div>
    </motion.div>
  );
};

export { VIRTUALS_URL };
export default CountdownBanner;
