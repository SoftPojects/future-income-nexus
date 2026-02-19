import { motion } from "framer-motion";
import { Sparkles, Lock, RefreshCw } from "lucide-react";

interface NeuralSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  isDisabled: boolean;
  onSelect: (suggestion: string) => void;
  onRefresh?: () => void;
}

const ShimmerCard = () => (
  <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card/30 px-3 py-2 h-9">
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
  </div>
);

const NeuralSuggestions = ({
  suggestions,
  isLoading,
  isDisabled,
  onSelect,
  onRefresh,
}: NeuralSuggestionsProps) => {
  return (
    <div className="px-3 py-2 border-t border-border/40 space-y-1.5">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={isDisabled ? {} : { opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles className="w-3 h-3 text-neon-cyan" />
          </motion.div>
          <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-muted-foreground">
            AGENT DIRECTIVES
          </span>
        </div>
        {onRefresh && (
          <motion.button
            onClick={onRefresh}
            disabled={isLoading || isDisabled}
            className="p-0.5 text-muted-foreground hover:text-neon-cyan transition-colors disabled:opacity-30"
            whileTap={{ scale: 0.9 }}
            title="Refresh directives"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
          </motion.button>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-1.5">
        {isLoading || suggestions.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <ShimmerCard key={i} />)
          : suggestions.map((s, i) => (
              <motion.button
                key={`${s}-${i}`}
                onClick={() => !isDisabled && onSelect(s)}
                disabled={isDisabled}
                className={`relative overflow-hidden rounded-lg border px-3 py-1.5 font-mono text-[10px] tracking-wider flex items-center gap-1.5 transition-all select-none ${
                  isDisabled
                    ? "border-border/30 text-muted-foreground/40 bg-card/10 cursor-not-allowed"
                    : "border-neon-cyan/25 text-neon-cyan/80 bg-neon-cyan/5 hover:bg-neon-cyan/10 hover:border-neon-cyan/50 hover:text-neon-cyan cursor-pointer"
                }`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                whileTap={isDisabled ? {} : { scale: 0.97 }}
              >
                {/* Subtle pulsing glow */}
                {!isDisabled && (
                  <motion.div
                    className="absolute inset-0 rounded-lg"
                    animate={{ opacity: [0, 0.06, 0] }}
                    transition={{ duration: 3, repeat: Infinity, delay: i * 1 }}
                    style={{
                      background: "radial-gradient(ellipse at 50% 50%, hsl(180 100% 50%), transparent 70%)",
                    }}
                  />
                )}

                {isDisabled ? (
                  <Lock className="w-2.5 h-2.5 shrink-0" />
                ) : (
                  <span className="text-neon-cyan/50 text-[8px]">›</span>
                )}
                <span className="relative z-10">{s}</span>
              </motion.button>
            ))}
      </div>
    </div>
  );
};

export default NeuralSuggestions;
