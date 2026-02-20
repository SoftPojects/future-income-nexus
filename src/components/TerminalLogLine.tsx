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

const getLineColor = (line: string) => {
  if (line.startsWith("[SUCCESS]")) return "text-neon-green text-glow-green";
  if (line.startsWith("[ALERT]")) return "text-neon-magenta text-glow-magenta";
  if (line.startsWith("[ERROR]")) return "text-destructive";
  if (line.startsWith("[DATA]")) return "text-yellow-400";
  if (line.startsWith("[TIP]")) return "text-neon-green text-glow-green font-bold";
  if (line.startsWith("[MARKET]")) return "text-yellow-400";
  return "text-neon-cyan";
};

const getLinePrefix = (line: string) => {
  if (line.startsWith("[SUCCESS]")) return "▶";
  if (line.startsWith("[ALERT]")) return "⚠";
  if (line.startsWith("[ERROR]")) return "✖";
  if (line.startsWith("[DATA]")) return "◈";
  if (line.startsWith("[TIP]")) return "★";
  if (line.startsWith("[MARKET]")) return "↑";
  return "›";
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
  const color = getLineColor(line);
  const prefix = getLinePrefix(line);

  return (
    <motion.div
      className={`font-mono flex items-start gap-2 group py-0.5 ${color}`}
      initial={isNew ? { opacity: 0, x: -8, backgroundColor: "hsl(180 100% 50% / 0.06)" } : { opacity: 1 }}
      animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
      transition={{ duration: isNew ? 0.25 : 0, backgroundColor: { duration: 1.5 } }}
    >
      {/* Line number */}
      <span className="text-muted-foreground text-[9px] shrink-0 mt-px select-none w-7 text-right">
        {String(index + 1).padStart(3, "0")}
      </span>

      {/* Prefix glyph */}
      <span className="shrink-0 text-[10px] mt-px opacity-60">{prefix}</span>

      {/* Content */}
      <span className="flex-1 leading-relaxed text-[11px]">
        {displayed}
        {isNew && !done && (
          <motion.span
            className="inline-block w-1.5 h-3 bg-current ml-0.5 align-middle"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}
      </span>

      {/* Voice button — only on completed lines */}
      {done && voicePlayback && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <VoiceSpeakButton
            text={line}
            id={`log-${index}`}
            playingId={voicePlayback.playingId}
            onPlay={voicePlayback.playText}
          />
        </span>
      )}
    </motion.div>
  );
};

export default TerminalLogLine;
