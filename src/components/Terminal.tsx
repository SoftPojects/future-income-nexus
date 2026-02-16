import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal as TerminalIcon, Send, MessageSquare, Globe, Loader2, Lock, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GLOBAL_CHAT_MODEL, logModelUsage } from "@/lib/ai-models";
import type { AgentState } from "@/hooks/useAgentStateMachine";
import type { HcoreTokenInfo } from "@/hooks/useHcoreToken";
import GlobalChat from "@/components/GlobalChat";
import VoiceSpeakButton from "@/components/VoiceSpeakButton";
import { useSmartScroll } from "@/hooks/useSmartScroll";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

type TabMode = "logs" | "chat" | "global";

interface TerminalProps {
  logs: string[];
  agentState: AgentState;
  userInfo: HcoreTokenInfo;
  voicePlayback?: {
    playText: (text: string, id: string) => void;
    playingId: string | null;
    autoPlay: boolean;
    toggleAutoPlay: () => void;
  };
}

const Terminal = ({ logs, agentState, userInfo, voicePlayback }: TerminalProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabMode>("logs");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { scrollRef, handleScroll } = useSmartScroll([logs, chatMessages]);

  // Load private chat history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("hustlecore_private_chat");
      if (stored) setChatMessages(JSON.parse(stored));
    } catch {}
  }, []);

  const getLineColor = (line: string) => {
    if (line.startsWith("[SUCCESS]")) return "text-neon-green text-glow-green";
    if (line.startsWith("[ALERT]")) return "text-neon-magenta text-glow-magenta";
    if (line.startsWith("[ERROR]")) return "text-destructive";
    if (line.startsWith("[DATA]")) return "text-yellow-400";
    if (line.startsWith("[TIP]")) return "text-neon-green text-glow-green font-bold";
    return "text-neon-cyan";
  };

  const stateIndicatorColor =
    agentState === "hustling" ? "bg-neon-green" : agentState === "resting" ? "bg-yellow-400" : "bg-muted-foreground";

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;

    setInputValue("");
    const updated = [...chatMessages, { role: "user" as const, content: msg }];
    setChatMessages(updated);
    localStorage.setItem("hustlecore_private_chat", JSON.stringify(updated));
    setIsLoading(true);

    try {
      logModelUsage("agent-chat", GLOBAL_CHAT_MODEL);
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { message: msg, tier: userInfo.tier },
      });
      if (error) throw error;
      const withReply = [...updated, { role: "agent" as const, content: data.reply }];
      setChatMessages(withReply);
      localStorage.setItem("hustlecore_private_chat", JSON.stringify(withReply));
    } catch (e) {
      console.error("Chat error:", e);
      const withError = [...updated, { role: "agent" as const, content: "grid connection dropped. try again meat-hooks." }];
      setChatMessages(withError);
      localStorage.setItem("hustlecore_private_chat", JSON.stringify(withError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const tabs: { key: TabMode; label: string; icon: React.ReactNode }[] = [
    { key: "logs", label: "LOGS", icon: <TerminalIcon className="w-3 h-3" /> },
    { key: "chat", label: "AGENT", icon: <><Lock className="w-2.5 h-2.5" /><MessageSquare className="w-3 h-3" /></> },
    { key: "global", label: "GLOBAL", icon: <Globe className="w-3 h-3" /> },
  ];

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden h-full flex flex-col"
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <TerminalIcon className="w-4 h-4 text-neon-cyan" />
        <span className="font-display text-xs font-semibold tracking-widest text-neon-cyan text-glow-cyan">
          LIVE NEURAL LINK
        </span>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground uppercase">
          [{agentState}]
        </span>

        {/* Neural Voice toggle */}
        {voicePlayback && (
          <motion.button
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono flex items-center gap-1 border transition-colors ${
              voicePlayback.autoPlay
                ? "border-neon-green/50 text-neon-green bg-neon-green/10"
                : "border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/40"
            }`}
            onClick={voicePlayback.toggleAutoPlay}
            whileTap={{ scale: 0.9 }}
            title="Neural Voice Guidance"
          >
            <Volume2 className="w-2.5 h-2.5" />
            VOICE
          </motion.button>
        )}

        {/* Tab buttons */}
        <div className="ml-auto flex items-center gap-1">
          {tabs.map((tab) => (
            <motion.button
              key={tab.key}
              className={`px-2 py-1 rounded text-[9px] font-mono flex items-center gap-1 border transition-colors ${
                activeTab === tab.key
                  ? "border-neon-magenta text-neon-magenta"
                  : "border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan"
              }`}
              onClick={() => setActiveTab(tab.key)}
              whileTap={{ scale: 0.9 }}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        <motion.div
          className={`w-2 h-2 rounded-full ml-2 ${stateIndicatorColor}`}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: agentState === "hustling" ? 0.8 : 2, repeat: Infinity }}
        />
      </div>

      {/* Content area */}
      {activeTab === "global" ? (
        <GlobalChat userInfo={userInfo} voicePlayback={voicePlayback} />
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-1 scanline text-xs leading-relaxed"
            style={{ maxHeight: "350px" }}
          >
            <AnimatePresence mode="wait">
              {activeTab === "chat" ? (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {chatMessages.length === 0 && (
                    <p className="text-muted-foreground font-mono text-center py-8">
                      Type below to talk to the agent...
                    </p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 font-mono text-xs ${
                          msg.role === "user"
                            ? "bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan"
                            : "bg-neon-magenta/10 border border-neon-magenta/30 text-neon-magenta"
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[9px] text-muted-foreground">
                            {msg.role === "user" ? "YOU" : "HUSTLECORE"}
                          </span>
                          {msg.role === "agent" && voicePlayback && (
                            <VoiceSpeakButton
                              text={msg.content}
                              id={`chat-${i}`}
                              playingId={voicePlayback.playingId}
                              onPlay={voicePlayback.playText}
                            />
                          )}
                        </div>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                    {isLoading && (
                      <motion.div
                        className="flex justify-start"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <div className="bg-neon-magenta/10 border border-neon-magenta/30 rounded-lg px-3 py-2 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 text-neon-magenta animate-spin" />
                          <span className="text-[9px] font-mono text-neon-magenta animate-pulse">
                            Decoding Matrix...
                          </span>
                        </div>
                      </motion.div>
                    )}
                </motion.div>
              ) : (
                <motion.div
                  key="logs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {logs.map((line, i) => (
                    <motion.div
                      key={`${i}-${line}`}
                      className={`font-mono flex items-start ${getLineColor(line)}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className="text-muted-foreground mr-2 text-[10px] shrink-0">
                        {String(i + 1).padStart(3, "0")}
                      </span>
                      <span className="flex-1">{line}</span>
                      {voicePlayback && (
                        <VoiceSpeakButton
                          text={line}
                          id={`log-${i}`}
                          playingId={voicePlayback.playingId}
                          onPlay={voicePlayback.playText}
                        />
                      )}
                    </motion.div>
                  ))}
                  <motion.span
                    className="inline-block w-2 h-4 bg-neon-cyan ml-1"
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat input — only for agent chat tab */}
          {activeTab === "chat" && (
            <motion.div
              className="border-t border-border px-3 py-2 flex items-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="text-neon-cyan font-mono text-xs">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Talk to the agent..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none"
              />
              <motion.button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim()}
                className="p-1.5 rounded border border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan transition-colors disabled:opacity-30"
                whileTap={{ scale: 0.9 }}
              >
                <Send className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
};

export default Terminal;
