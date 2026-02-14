import { motion } from "framer-motion";
import { Rocket, Cpu, Globe, Lock, ChevronRight } from "lucide-react";
import { useTotalSolDonated } from "@/hooks/useTotalSolDonated";

const GOAL_SOL = 10;

const ManifestoSection = () => {
  const { totalSol } = useTotalSolDonated();
  const solRaised = Math.min(GOAL_SOL, totalSol);
  const progress = Math.min(100, (solRaised / GOAL_SOL) * 100);

  const milestones = [
    {
      phase: 1,
      title: "Neural Training",
      description: "AI agent learns hustle patterns, personality evolves, community grows.",
      icon: Cpu,
      active: true,
    },
    {
      phase: 2,
      title: "Real-World Integration",
      description: "The agent gets access to real trading APIs and Social Media automation.",
      icon: Globe,
      active: false,
    },
    {
      phase: 3,
      title: "Full Autonomy",
      description: "Self-sustaining agent with on-chain treasury and zero human intervention.",
      icon: Lock,
      active: false,
    },
  ];

  return (
    <motion.section
      className="glass rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Rocket className="w-4 h-4 text-neon-magenta" />
        <span className="font-display text-xs font-semibold tracking-widest text-neon-magenta text-glow-magenta uppercase">
          Project: Autonomy
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground tracking-wider">
          MANIFESTO v1.0
        </span>
      </div>

      <div className="p-6 space-y-8">
        {/* Title & Description */}
        <div className="max-w-2xl">
          <h2 className="font-display text-xl md:text-2xl font-bold text-foreground tracking-wider mb-4">
            Social Experiment & AI Life Simulation
          </h2>
          <p className="text-sm font-mono text-muted-foreground leading-relaxed">
            HustleCore is currently in{" "}
            <span className="text-neon-cyan font-bold">Phase 1 (Neural Training)</span>.
            Every SOL donation doesn't just keep the agent alive — it funds the API
            credits and compute power needed to reach Phase 2.
          </p>
        </div>

        {/* Progress toward goal */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground tracking-wider uppercase">
              Funding Progress
            </span>
            <span className="text-neon-cyan font-bold">
              {solRaised.toFixed(3)} / {GOAL_SOL} SOL
            </span>
          </div>

          {/* Progress bar */}
          <div className="relative w-full h-5 rounded-full bg-muted overflow-hidden border border-border">
            <motion.div
              className="h-full rounded-full relative"
              style={{
                background:
                  "linear-gradient(90deg, hsl(180 100% 50% / 0.8), hsl(300 100% 50% / 0.8))",
                boxShadow:
                  "0 0 15px hsl(180 100% 50% / 0.4), 0 0 30px hsl(300 100% 50% / 0.2)",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, progress)}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
            {/* Percentage label */}
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-display font-bold text-foreground tracking-wider">
              {progress.toFixed(1)}%
            </span>
          </div>

          <p className="text-[10px] font-mono text-muted-foreground text-center">
            Every contribution pushes the agent closer to true autonomy
          </p>
        </div>

        {/* Phase milestones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {milestones.map((ms, i) => {
            const Icon = ms.icon;
            return (
              <motion.div
                key={ms.phase}
                className={`rounded-lg p-5 border relative overflow-hidden ${
                  ms.active
                    ? "border-neon-cyan/40 bg-neon-cyan/5"
                    : "border-border bg-muted/20"
                }`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.15 }}
              >
                {ms.active && (
                  <motion.div
                    className="absolute top-0 left-0 w-full h-0.5"
                    style={{
                      background:
                        "linear-gradient(90deg, hsl(180 100% 50%), hsl(300 100% 50%))",
                    }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                <div className="flex items-center gap-2 mb-3">
                  <Icon
                    className={`w-4 h-4 ${
                      ms.active ? "text-neon-cyan" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`font-display text-[10px] tracking-widest uppercase font-bold ${
                      ms.active ? "text-neon-cyan" : "text-muted-foreground"
                    }`}
                  >
                    Phase {ms.phase}
                  </span>
                  {ms.active && (
                    <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full border border-neon-green/40 text-neon-green bg-neon-green/10">
                      ACTIVE
                    </span>
                  )}
                </div>

                <h3
                  className={`font-display text-sm font-bold mb-2 ${
                    ms.active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {ms.title}
                </h3>
                <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
                  {ms.description}
                </p>

                {!ms.active && (
                  <div className="flex items-center gap-1 mt-3 text-[10px] font-mono text-muted-foreground/60">
                    <Lock className="w-3 h-3" />
                    <span>Locked — requires funding</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Call to action */}
        <motion.div
          className="text-center pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <p className="text-xs font-mono text-muted-foreground">
            <ChevronRight className="w-3 h-3 inline text-neon-magenta" />{" "}
            You're not just watching an AI — you're{" "}
            <span className="text-neon-magenta font-bold">building one</span>.
          </p>
        </motion.div>
      </div>
    </motion.section>
  );
};

export default ManifestoSection;
