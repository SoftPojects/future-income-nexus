import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { HcoreTokenInfo } from "@/hooks/useHcoreToken";
import { useSmartScroll } from "@/hooks/useSmartScroll";

interface GlobalMessage {
  id: string;
  wallet_address: string | null;
  display_name: string;
  is_holder: boolean;
  content: string;
  created_at: string;
}

interface GlobalChatProps {
  userInfo: HcoreTokenInfo;
}

const GlobalChat = ({ userInfo }: GlobalChatProps) => {
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { scrollRef, handleScroll } = useSmartScroll([messages]);

  useEffect(() => {
    const loadMessages = async () => {
      const { data } = await supabase
        .from("global_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as GlobalMessage[]);
    };
    loadMessages();

    const channel = supabase
      .channel("global-chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_messages" },
        (payload) => {
          const msg = payload.new as GlobalMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            const updated = [...prev, msg];
            return updated.length > 200 ? updated.slice(-200) : updated;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isSending) return;
    setInputValue("");
    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-global-message", {
        body: {
          wallet_address: userInfo.walletAddress,
          display_name: userInfo.displayName,
          is_holder: userInfo.isHolder,
          content: msg,
        },
      });
      if (error) throw error;
    } catch (e) {
      console.error("Failed to send global message:", e);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOwnMessage = (msg: GlobalMessage) => {
    if (userInfo.walletAddress && msg.wallet_address) {
      return msg.wallet_address === userInfo.walletAddress;
    }
    return msg.display_name === userInfo.displayName;
  };

  const getNameColor = (msg: GlobalMessage) => {
    if (msg.is_holder) return "text-yellow-400";
    if (msg.wallet_address) return "text-neon-cyan";
    return "text-muted-foreground";
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 text-xs"
        style={{ maxHeight: "350px" }}
      >
        {messages.length === 0 && (
          <p className="text-muted-foreground font-mono text-center py-8">
            No messages yet. Be the first to speak...
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className="font-mono"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className={`font-bold ${getNameColor(msg)}`}>
                {msg.is_holder && (
                  <Crown className="w-3 h-3 inline mr-1 text-yellow-400" />
                )}
                {msg.display_name}
                {msg.is_holder && (
                  <span className="ml-1 text-[8px] bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 rounded px-1 py-0.5 font-bold">
                    VIP
                  </span>
                )}
                {isOwnMessage(msg) && (
                  <span className="ml-1 text-[8px] text-muted-foreground">(You)</span>
                )}
              </span>
              <span className="text-muted-foreground mx-1">:</span>
              <span className="text-foreground">{msg.content}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {isSending && (
          <div className="flex items-center gap-1 text-neon-magenta">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-[10px] font-mono animate-pulse">Neural Link Processing...</span>
          </div>
        )}
      </div>

      <div className="border-t border-border px-3 py-2 flex items-center gap-2">
        <span className="text-neon-cyan font-mono text-xs">&gt;</span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something to the hive..."
          disabled={isSending}
          className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none"
        />
        <motion.button
          onClick={handleSend}
          disabled={isSending || !inputValue.trim()}
          className="p-1.5 rounded border border-border text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan transition-colors disabled:opacity-30"
          whileTap={{ scale: 0.9 }}
        >
          <Send className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
};

export default GlobalChat;
