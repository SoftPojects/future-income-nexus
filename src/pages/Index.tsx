import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Wifi, Twitter, Menu, X, Wallet, Github, Radio } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCustomWalletModal } from "@/hooks/useCustomWalletModal";
import ConnectWalletButton from "@/components/ConnectWalletButton";
import CustomWalletModal from "@/components/CustomWalletModal";
import NeonCube from "@/components/NeonCube";
import Terminal from "@/components/Terminal";
import StatCards from "@/components/StatCards";
import ActionButtons from "@/components/ActionButtons";
import TopSupporters from "@/components/TopSupporters";
import RevealedTributes from "@/components/RevealedTributes";
import FeedCryptoModal from "@/components/FeedCryptoModal";
import ShareHustleModal from "@/components/ShareHustleModal";
import Phase2VoteModal from "@/components/Phase2VoteModal";
import ManifestoSection from "@/components/ManifestoSection";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import AlphaDrops from "@/components/AlphaDrops";
import SolGoalWidget from "@/components/SolGoalWidget";
import LiveXTransmissions from "@/components/LiveXTransmissions";
import AudioToggle from "@/components/AudioToggle";
import TradeHcoreButton from "@/components/TradeHcoreButton";
import TokenStatus from "@/components/TokenStatus";
import CountdownBanner from "@/components/CountdownBanner";
import HuntingIndicator from "@/components/HuntingIndicator";
import { useAgentStateMachine } from "@/hooks/useAgentStateMachine";
import { useHcoreToken } from "@/hooks/useHcoreToken";
import { useAudioSystem } from "@/hooks/useAudioSystem";
import { useVoicePlayback } from "@/hooks/useVoicePlayback";
import { supabase } from "@/integrations/supabase/client";

/** Mobile wallet button that closes the sheet first, then opens custom wallet modal */
const MobileWalletButton = ({ onBeforeOpen }: { onBeforeOpen: () => void }) => {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useCustomWalletModal();

  const truncatedAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  if (connected && publicKey) {
    return (
      <motion.button
        className="w-full glass rounded-lg px-4 py-3 font-mono text-xs tracking-wider text-neon-green border border-neon-green/30 flex items-center justify-center gap-3 cursor-pointer"
        whileTap={{ scale: 0.97 }}
        onClick={() => disconnect()}
      >
        <Wallet className="w-4 h-4" />
        <span className="text-glow-green">{truncatedAddress}</span>
        <span className="text-[9px] text-muted-foreground ml-auto">TAP TO DISCONNECT</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      className="w-full rounded-lg px-4 py-3.5 font-mono text-sm font-bold tracking-wider text-neon-magenta border-2 border-neon-magenta/50 bg-neon-magenta/10 flex items-center justify-center gap-3 cursor-pointer"
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        onBeforeOpen();
        setTimeout(() => setVisible(true), 500);
      }}
    >
      <Wallet className="w-5 h-5" />
      CONNECT WALLET
    </motion.button>
  );
};

const Index = () => {
  const agent = useAgentStateMachine();
  const userInfo = useHcoreToken();
  const audio = useAudioSystem();
  const voice = useVoicePlayback();
  const { publicKey } = useWallet();
  const [feedOpen, setFeedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [voteOpen, setVoteOpen] = useState(false);
  const [lastTweetTime, setLastTweetTime] = useState<string | null>(null);
  const [showAlpha, setShowAlpha] = useState(false);
  const [vipNotified, setVipNotified] = useState(false);
  const [isDonor, setIsDonor] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevLogCount = useRef(0);
  const vocalModulesLoggedRef = useRef(false);

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

  // Check if connected wallet is a donor
  useEffect(() => {
    if (!publicKey) { setIsDonor(false); return; }
    supabase
      .from("donations")
      .select("id")
      .eq("wallet_address", publicKey.toBase58())
      .limit(1)
      .then(({ data }) => setIsDonor(!!(data && data.length > 0)));
  }, [publicKey]);

  // Play blip on new terminal log + auto-play voice
  useEffect(() => {
    if (agent.logs.length > prevLogCount.current && prevLogCount.current > 0) {
      audio.playBlip();
      const latestLog = agent.logs[agent.logs.length - 1];
      if (latestLog) voice.enqueueAutoPlay(latestLog);
    }
    prevLogCount.current = agent.logs.length;
  }, [agent.logs.length, audio.playBlip, voice.enqueueAutoPlay]);

  // Log vocal modules initialization once
  useEffect(() => {
    if (!vocalModulesLoggedRef.current && agent.logs.length > 3) {
      vocalModulesLoggedRef.current = true;
      setTimeout(() => {
        agent.addLog("[SYSTEM]: Vocal modules initialized. I can finally speak to the meat-hooks.");
      }, 5000);
    }
  }, [agent.logs.length]);

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
      {/* Countdown Banner */}
      <CountdownBanner />

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
        className="border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between relative z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Logo — always visible */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Activity className="w-5 h-5 text-neon-cyan" />
          <h1 className="font-display text-base sm:text-lg font-bold tracking-[0.3em] text-foreground">
            HUSTLECORE
          </h1>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
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

        {/* Mobile hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {/* Compact status pill */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${isDepleted ? "border-destructive/40 bg-destructive/10" : "border-neon-green/30 bg-neon-green/5"}`}>
            <Wifi className={`w-3 h-3 ${isDepleted ? "text-destructive" : "text-neon-green"}`} />
            <span className={`text-[9px] font-mono font-bold uppercase ${stateColor}`}>
              {agent.state}
            </span>
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-lg border border-border hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all">
                <Menu className="w-5 h-5 text-neon-cyan" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-background border-l border-neon-cyan/20 p-0" onClick={(e) => e.stopPropagation()}>
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex flex-col h-full">
                {/* Menu header */}
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Activity className="w-4 h-4 text-neon-cyan" />
                  <span className="font-display text-sm font-bold tracking-[0.2em] text-neon-cyan">
                    COMMAND MENU
                  </span>
                </div>

                {/* Status card */}
                <div className="mx-4 mt-4 p-3 rounded-lg border border-border bg-card/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground tracking-wider">SYSTEM STATUS</span>
                    <Wifi className={`w-3.5 h-3.5 ${isDepleted ? "text-destructive" : "text-neon-green"}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isDepleted ? "bg-destructive" : "bg-neon-green"} animate-pulse`} />
                    <span className={`text-xs font-mono font-bold uppercase ${stateColor}`}>
                      {isDepleted ? "OFFLINE" : "CONNECTED"} — {agent.state}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 p-4 flex-1">
                  <span className="text-[9px] font-mono text-muted-foreground tracking-widest mb-1">ACTIONS</span>
                  <TradeHcoreButton />
                  <MobileWalletButton onBeforeOpen={() => setMobileMenuOpen(false)} />
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[10px] font-mono text-muted-foreground">Audio</span>
                    <AudioToggle muted={audio.muted} onToggle={audio.toggleMute} />
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border">
                  <HuntingIndicator />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-4">
        {/* Token Status — full width */}
        <TokenStatus />

        {/* SOL Goal Widget — full width */}
        <SolGoalWidget />

        {/* Row 2: Chat (8 cols) + Avatar (4 cols) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
          <div className="md:col-span-1 lg:col-span-8 flex flex-col gap-2">
            {/* VOICE FEED indicator */}
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg w-fit"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Radio className="w-3.5 h-3.5 text-neon-green" />
              </motion.div>
              <span className="text-[9px] font-mono font-bold tracking-widest text-neon-green text-glow-green">
                VOICE FEED: ONLINE
              </span>
            </motion.div>
            <Terminal
              logs={agent.logs}
              agentState={agent.state}
              userInfo={userInfo}
              voicePlayback={{
                playText: voice.playText,
                playingId: voice.playingId,
                autoPlay: voice.autoPlay,
                toggleAutoPlay: voice.toggleAutoPlay,
              }}
            />
          </div>

          <motion.div
            className="md:col-span-1 lg:col-span-4 glass rounded-lg p-6 flex items-center justify-center min-h-[300px] lg:min-h-0"
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
          onVotePhase2={() => setVoteOpen(true)}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
          <div className="md:col-span-1 lg:col-span-6">
            <TopSupporters />
          </div>
          <div className="md:col-span-1 lg:col-span-6">
            <RevealedTributes />
          </div>
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
          <div className="flex items-center gap-3">
            {lastTweetTime ? (
              <a
                href="https://x.com/hustlecore_ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neon-cyan flex items-center gap-1 hover:text-neon-magenta transition-colors cursor-pointer"
              >
                <Twitter className="w-3 h-3" />
                LAST X TRANSMISSION: {new Date(lastTweetTime).toLocaleString()}
              </a>
            ) : (
              <a
                href="https://x.com/hustlecore_ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neon-cyan flex items-center gap-1 hover:text-neon-magenta transition-colors cursor-pointer"
              >
                <Twitter className="w-3 h-3" />
                FOLLOW ON X
              </a>
            )}
            <a
              href="https://github.com/SoftPojects/future-income-nexus"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan flex items-center gap-1 hover:text-neon-magenta transition-colors cursor-pointer"
            >
              <Github className="w-3 h-3" />
              OPEN SOURCE
            </a>
          </div>
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
      <Phase2VoteModal
        open={voteOpen}
        onClose={() => setVoteOpen(false)}
        isDonor={isDonor}
      />

      {/* Custom wallet modal for mobile-friendly deep linking */}
      <CustomWalletModal />
    </div>
  );
};

export default Index;
