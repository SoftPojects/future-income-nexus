import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Activity, Wifi, Twitter } from "lucide-react";
import { toast } from "sonner";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import NeonCube from "@/components/NeonCube";
import Terminal from "@/components/Terminal";
import StatCards from "@/components/StatCards";
import ActionButtons from "@/components/ActionButtons";
import TopSupporters from "@/components/TopSupporters";
import RevealedTributes from "@/components/RevealedTributes";
import FeedCryptoModal from "@/components/FeedCryptoModal";
import ShareHustleModal from "@/components/ShareHustleModal";
import ManifestoSection from "@/components/ManifestoSection";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import AlphaDrops from "@/components/AlphaDrops";
import SolGoalWidget from "@/components/SolGoalWidget";
import LiveXTransmissions from "@/components/LiveXTransmissions";
import AudioToggle from "@/components/AudioToggle";
import TradeHcoreButton from "@/components/TradeHcoreButton";
import TokenStatus from "@/components/TokenStatus";
import HuntingIndicator from "@/components/HuntingIndicator";
import { useAgentStateMachine } from "@/hooks/useAgentStateMachine";
import { useHcoreToken } from "@/hooks/useHcoreToken";
import { useAudioSystem } from "@/hooks/useAudioSystem";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const agent = useAgentStateMachine();
  const userInfo = useHcoreToken();
  const audio = useAudioSystem();
  const [feedOpen, setFeedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [lastTweetTime, setLastTweetTime] = useState<string | null>(null);
  const [showAlpha, setShowAlpha] = useState(false);
  const [vipNotified, setVipNotified] = useState(false);
  const prevLogCount = useRef(0);

  useEffect(() => {
    supabase
      .from("tweet_queue")
      .select("posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.posted_at) setLastTweetTime(data[0].posted_at);
      });
  }, []);

  // Play blip on new terminal log
  useEffect(() => {
    if (agent.logs.length > prevLogCount.current && prevLogCount.current > 0) {
      audio.playBlip();
    }
    prevLogCount.current = agent.logs.length;
  }, [agent.logs.length, audio.playBlip]);

  // Play power-up on donation confirmed (energy surge)
  useEffect(() => {
    const handler = () => audio.playPowerUp();
    window.addEventListener("donation-confirmed", handler);
    return () => window.removeEventListener("donation-confirmed", handler);
  }, [audio.playPowerUp]);

  // VIP holder detection notification
  useEffect(() => {
    if (userInfo.isHolder && !vipNotified) {
      setVipNotified(true);
      toast("VIP Holder detected. Neural link upgraded to Level 2.", {
        style: {
          background: "hsl(230 15% 8%)",
          border: "1px solid hsl(45 100% 50% / 0.5)",
          color: "hsl(45 100% 60%)",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
        },
        duration: 5000,
      });
    }
  }, [userInfo.isHolder, vipNotified]);

  const isDepleted = agent.state === "depleted";

  const stateColor = isDepleted
    ? "text-destructive"
    : agent.state === "hustling"
    ? "text-neon-green"
    : agent.state === "resting"
    ? "text-yellow-400"
    : "text-muted-foreground";

  const handleFueled = useCallback(async (walletAddress: string) => {
    agent.setLastBenefactor(walletAddress);
    agent.addLog(
      `[SYSTEM]: ⚡ Detecting incoming signal from ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}... Stand by for energy surge.`
    );

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
          <TradeHcoreButton />
          <ConnectWalletButton />
          <AudioToggle muted={audio.muted} onToggle={audio.toggleMute} />
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
        {/* Token Status */}
        <TokenStatus />

        {/* SOL Goal Widget */}
        <SolGoalWidget />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Terminal logs={agent.logs} agentState={agent.state} userInfo={userInfo} />
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
          onFeedCrypto={() => setFeedOpen(true)}
          onShareHustle={() => setShareOpen(true)}
        />

        {/* Alpha Drops Toggle */}
        <div className="flex items-center gap-3">
          <motion.button
            className={`glass rounded-lg px-4 py-2 font-mono text-xs tracking-wider flex items-center gap-2 border transition-colors ${
              showAlpha
                ? "border-neon-magenta/50 text-neon-magenta"
                : "border-border text-muted-foreground hover:text-neon-magenta hover:border-neon-magenta/30"
            }`}
            onClick={() => setShowAlpha(!showAlpha)}
            whileTap={{ scale: 0.95 }}
          >
            ◈ ALPHA DROPS
          </motion.button>
          {userInfo.isHolder && (
            <span className="text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/30 rounded px-2 py-0.5">
              VIP ACCESS GRANTED
            </span>
          )}
        </div>

        {showAlpha && <AlphaDrops userInfo={userInfo} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopSupporters />
          <RevealedTributes />
        </div>

        <ManifestoSection />

        {/* Live X Transmissions */}
        <LiveXTransmissions />

        <motion.div
          className="glass rounded-lg px-4 py-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span>SYSTEM UPTIME: 47h 23m 11s</span>
          {lastTweetTime && (
            <a
              href="https://x.com/hustlecore_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan flex items-center gap-1 hover:text-neon-cyan/80 transition-colors cursor-pointer"
            >
              <Twitter className="w-3 h-3" />
              LAST X TRANSMISSION: {new Date(lastTweetTime).toLocaleString()}
            </a>
          )}
          {!lastTweetTime && (
            <a
              href="https://x.com/hustlecore_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan flex items-center gap-1 hover:text-neon-cyan/80 transition-colors cursor-pointer"
            >
              <Twitter className="w-3 h-3" />
              FOLLOW ON X
            </a>
          )}
          {agent.lastBenefactor && (
            <span className="text-neon-magenta">
              LAST BENEFACTOR: {agent.lastBenefactor.slice(0, 4)}...{agent.lastBenefactor.slice(-4)}
            </span>
          )}
          <HuntingIndicator />
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
