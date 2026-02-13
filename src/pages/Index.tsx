import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, Wifi } from "lucide-react";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import NeonCube from "@/components/NeonCube";
import Terminal from "@/components/Terminal";
import StatCards from "@/components/StatCards";
import ActionButtons from "@/components/ActionButtons";
import Leaderboard from "@/components/Leaderboard";
import FeedCryptoModal from "@/components/FeedCryptoModal";
import ShareHustleModal from "@/components/ShareHustleModal";
import ManifestoSection from "@/components/ManifestoSection";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import { useAgentStateMachine } from "@/hooks/useAgentStateMachine";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const agent = useAgentStateMachine();
  const [feedOpen, setFeedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const isDepleted = agent.state === "depleted";

  const stateColor = isDepleted
    ? "text-destructive"
    : agent.state === "hustling"
    ? "text-neon-green"
    : agent.state === "resting"
    ? "text-yellow-400"
    : "text-muted-foreground";

  const handleFueled = useCallback(async (walletAddress: string) => {
    agent.setEnergy((prev) => Math.min(100, prev + 50));
    agent.setState("hustling");
    agent.setCelebrating(true);
    agent.setLastBenefactor(walletAddress);
    agent.addLog(
      `[SUCCESS]: ⚡ POWER OVERWHELMING! Thanks to the human who just fueled my brain with 0.01 SOL. I can see the matrix now... and it looks like profit.`
    );

    // Generate a special hustle tip for the community
    try {
      const { data, error } = await supabase.functions.invoke("generate-hustle-tip", {
        body: { balance: agent.totalHustled },
      });
      if (!error && data?.tip) {
        agent.addLog(`[TIP]: Fuel detected! ${data.tip}`);
      }
    } catch (e) {
      console.error("Hustle tip generation failed:", e);
    }
  }, [agent]);

  return (
    <div className="min-h-screen bg-background grid-bg relative overflow-hidden">
      {/* Ambient glow effects */}
      <div
        className="fixed top-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none"
        style={{
          background: isDepleted
            ? "radial-gradient(circle, hsl(0 84% 60% / 0.2), transparent 70%)"
            : "radial-gradient(circle, hsl(180 100% 50% / 0.3), transparent 70%)",
        }}
      />
      <div
        className="fixed bottom-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-15 pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(300 100% 50% / 0.3), transparent 70%)",
        }}
      />

      {/* Header */}
      <motion.header
        className="border-b border-border px-6 py-4 flex items-center justify-between relative z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-neon-cyan" />
          <h1 className="font-display text-lg font-bold tracking-[0.3em] text-foreground">
            HUSTLECORE
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <ConnectWalletButton />
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${isDepleted ? "text-destructive" : "text-neon-green"}`} />
            <span className={`text-[10px] font-mono tracking-wider ${isDepleted ? "text-destructive" : "text-neon-green text-glow-green"}`}>
              {isDepleted ? "OFFLINE" : "CONNECTED"}
            </span>
          </div>
          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${stateColor}`}>
            STATE: {agent.state}
          </span>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 p-6 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Terminal logs={agent.logs} agentState={agent.state} />
          </div>

          <motion.div
            className="glass rounded-lg p-6 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <NeonCube sassyMessage={agent.sassyMessage} agentState={agent.state} celebrating={agent.celebrating} />
          </motion.div>
        </div>

        <StatCards
          totalHustled={agent.totalHustled}
          energy={agent.energy}
          agentState={agent.state}
          strategy={agent.strategy}
        />

        <ActionButtons
          agentState={agent.state}
          onStateChange={agent.setState}
          onFeedCrypto={() => setFeedOpen(true)}
          onShareHustle={() => setShareOpen(true)}
        />

        <Leaderboard
          playerBalance={agent.totalHustled}
          sassyMessage={agent.sassyMessage}
        />

        <ManifestoSection totalHustled={agent.totalHustled} />

        <motion.div
          className="glass rounded-lg px-4 py-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span>SYSTEM UPTIME: 47h 23m 11s</span>
          {agent.lastBenefactor && (
            <span className="text-neon-magenta">
              LAST BENEFACTOR: {agent.lastBenefactor.slice(0, 4)}...{agent.lastBenefactor.slice(-4)}
            </span>
          )}
          <span>TASKS COMPLETED: 1,247</span>
          <span className="text-neon-cyan">LATENCY: 12ms</span>
        </motion.div>
      </main>

      {/* Celebration Overlay */}
      <CelebrationOverlay active={agent.celebrating} onComplete={() => agent.setCelebrating(false)} />

      {/* Modals */}
      <FeedCryptoModal open={feedOpen} onClose={() => setFeedOpen(false)} onFueled={handleFueled} />
      <ShareHustleModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        totalHustled={agent.totalHustled}
        energy={agent.energy}
        agentState={agent.state}
        strategy={agent.strategy.name}
      />
    </div>
  );
};

export default Index;
