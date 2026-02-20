import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import VoiceSpeakButton from "@/components/VoiceSpeakButton";

interface TerminalLogLineProps {
  line: string;
  index: number;
  isNew?: boolean;
  voicePlayback?: {
    playText: (text: string, id: string) => void;
    playingId: string | null;
  };
}

type LogMeta = {
  color: string;
  glyph: string;
  glyphColor: string;
  borderColor: string;
  flashBg: string;
};

const getLineMeta = (line: string): LogMeta => {
  if (line.startsWith("[SUCCESS]"))
    return { color: "text-neon-green text-glow-green", glyph: "▶", glyphColor: "text-neon-green", borderColor: "border-l-neon-green/50", flashBg: "hsl(120 100% 50% / 0.05)" };
  if (line.startsWith("[ALERT]"))
    return { color: "text-neon-magenta text-glow-magenta", glyph: "⚠", glyphColor: "text-neon-magenta", borderColor: "border-l-neon-magenta/50", flashBg: "hsl(300 100% 50% / 0.05)" };
  if (line.startsWith("[ERROR]"))
    return { color: "text-destructive", glyph: "✖", glyphColor: "text-destructive", borderColor: "border-l-destructive/50", flashBg: "hsl(0 84% 60% / 0.05)" };
  if (line.startsWith("[DATA]"))
    return { color: "text-yellow-400", glyph: "◈", glyphColor: "text-yellow-400", borderColor: "border-l-yellow-400/50", flashBg: "hsl(45 100% 50% / 0.05)" };
  if (line.startsWith("[TIP]"))
    return { color: "text-neon-green text-glow-green font-bold", glyph: "★", glyphColor: "text-neon-green", borderColor: "border-l-neon-green/80", flashBg: "hsl(120 100% 50% / 0.08)" };
  if (line.startsWith("[MARKET]"))
    return { color: "text-yellow-400", glyph: "↑", glyphColor: "text-yellow-400", borderColor: "border-l-yellow-400/40", flashBg: "hsl(45 100% 50% / 0.04)" };
  if (line.startsWith("[SYSTEM]"))
    return { color: "text-neon-cyan", glyph: "⬡", glyphColor: "text-neon-cyan/70", borderColor: "border-l-neon-cyan/20", flashBg: "hsl(180 100% 50% / 0.04)" };
  return { color: "text-neon-cyan", glyph: "›", glyphColor: "text-neon-cyan/50", borderColor: "border-l-transparent", flashBg: "hsl(180 100% 50% / 0.03)" };
};

/** Typewriter effect for newly added lines */
function useTypewriter(text: string, isNew: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState(isNew ? "" : text);
  const [done, setDone] = useState(!isNew);

  useEffect(() => {
    if (!isNew) { setDisplayed(text); setDone(true); return; }
    // Don't animate very long lines — just show them
    if (text.length > 120) { setDisplayed(text); setDone(true); return; }
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setDone(true); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, isNew]);

  return { displayed, done };
}

const TerminalLogLine = ({ line, index, isNew = false, voicePlayback }: TerminalLogLineProps) => {
  const { displayed, done } = useTypewriter(line, isNew);
  const { color, glyph, glyphColor, borderColor, flashBg } = getLineMeta(line);

  return (
    <motion.div
      className={`font-mono flex items-start gap-2 group py-0.5 pl-2 border-l-2 ${borderColor} ${color}`}
      initial={isNew ? { opacity: 0, x: -6, backgroundColor: flashBg } : { opacity: 1 }}
      animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
      transition={{ duration: isNew ? 0.2 : 0, backgroundColor: { duration: 2 } }}
    >
      {/* Line number */}
      <span className="text-muted-foreground text-[9px] shrink-0 mt-px select-none w-6 text-right tabular-nums">
        {String(index + 1).padStart(3, "0")}
      </span>

      {/* Prefix glyph — color-matched, slightly larger */}
      <span className={`shrink-0 text-[11px] mt-px font-bold ${glyphColor}`} aria-hidden>
        {glyph}
      </span>

      {/* Content */}
      <span className="flex-1 leading-relaxed text-[11px] break-all">
        {displayed}
        {isNew && !done && (
          <motion.span
            className="inline-block w-1.5 h-3 bg-current ml-0.5 align-middle"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.45, repeat: Infinity }}
          />
        )}
      </span>

      {/* Voice button — revealed on hover, only after typewriter completes */}
      {done && voicePlayback && (
        <motion.span
          className="opacity-0 group-hover:opacity-100 shrink-0"
          transition={{ duration: 0.15 }}
        >
          <VoiceSpeakButton
            text={line}
            id={`log-${index}`}
            playingId={voicePlayback.playingId}
            onPlay={voicePlayback.playText}
          />
        </motion.span>
      )}
    </motion.div>
  );
};

export default TerminalLogLine;
