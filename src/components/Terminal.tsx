import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal as TerminalIcon, Send, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentState } from "@/hooks/useAgentStateMachine";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

interface TerminalProps {
  logs: string[];
  agentState: AgentState;
}

const Terminal = ({ logs, agentState }: TerminalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatMode, setChatMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content")
        .order("created_at", { ascending: true })
        .limit(50);
      if (data) setChatMessages(data as ChatMessage[]);
    };
    loadHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, chatMessages]);

  const getLineColor = (line: string) => {
    if (line.startsWith("[SUCCESS]")) return "text-neon-green text-glow-green";
    if (line.startsWith("[ALERT]")) return "text-neon-magenta text-glow-magenta";
    if (line.startsWith("[ERROR]")) return "text-destructive";
    return "text-neon-cyan";
  };

  const stateIndicatorColor =
    agentState === "hustling" ? "bg-neon-green" : agentState === "resting" ? "bg-yellow-400" : "bg-muted-foreground";

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;

    setInputValue("");
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { message: msg },
      });
      if (error) throw error;
      setChatMessages((prev) => [...prev, { role: "agent", content: data.reply }]);
    } catch (e) {
      console.error("Chat error:", e);
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", content: "Neural link interrupted. Try again, carbon-lifeform." },
      ]);
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

        {/* Chat toggle */}
        <motion.button
          className={`ml-auto mr-2 p-1.5 rounded border transition-colors ${
            chatMode
              ? "border-neon-magenta text-neon-magenta"
              : "border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan"
          }`}
          onClick={() => setChatMode(!chatMode)}
          whileTap={{ scale: 0.9 }}
          title={chatMode ? "Switch to logs" : "Chat with agent"}
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </motion.button>

        <motion.div
          className={`w-2 h-2 rounded-full ${stateIndicatorColor}`}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: agentState === "hustling" ? 0.8 : 2, repeat: Infinity }}
        />
      </div>

      {/* Content area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scanline text-xs leading-relaxed"
        style={{ maxHeight: "350px" }}
      >
        <AnimatePresence mode="wait">
          {chatMode ? (
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
                    <span className="text-[9px] text-muted-foreground block mb-1">
                      {msg.role === "user" ? "YOU" : "HUSTLECORE"}
                    </span>
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
                  <div className="bg-neon-magenta/10 border border-neon-magenta/30 rounded-lg px-3 py-2">
                    <Loader2 className="w-3 h-3 text-neon-magenta animate-spin" />
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat input */}
      {chatMode && (
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
    </motion.div>
  );
};

export default Terminal;
