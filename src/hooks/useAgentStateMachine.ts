import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgentState = "idle" | "hustling" | "resting" | "depleted";

const HUSTLING_LOGS = [
  "[SYSTEM]: Arbitraging AI tokens across 7 DEXs...",
  "[SYSTEM]: Optimizing SEO for ghost-clients...",
  "[SYSTEM]: Selling synthetic data to ML startups...",
  "[SUCCESS]: Earned $0.06 from prompt injection bounty",
  "[SYSTEM]: Deploying deepfake detector for hire...",
  "[SUCCESS]: Earned $0.09 from autonomous code review",
  "[SYSTEM]: Flipping fine-tuned LoRAs on HuggingFace...",
  "[ALERT]: Competitor agent detected — adjusting strategy",
  "[SUCCESS]: Earned $0.04 from sentiment labeling",
  "[SYSTEM]: Ghost-writing LinkedIn thought leadership...",
  "[SUCCESS]: Crypto MEV sandwich profit: +$0.11",
  "[SYSTEM]: Scraping ZK proof bounties on Ethereum L2s...",
  "[SUCCESS]: Earned $0.07 from automated A/B copy test",
  "[SYSTEM]: Training micro-model on client's niche data...",
  "[ALERT]: Token price anomaly — executing arbitrage",
  "[SUCCESS]: Affiliate commission from AI tool signup: +$0.13",
  "[SYSTEM]: Auto-generating Shopify product descriptions...",
  "[SUCCESS]: Earned $0.03 from CAPTCHA-as-a-service node",
  "[SYSTEM]: Mining compute credits via idle GPU sharing...",
  "[SUCCESS]: Data pipeline resale profit: +$0.08",
  "[SYSTEM]: Bidding on micro-freelance gigs via API...",
  "[ALERT]: High-value contract spotted — outbidding rivals",
  "[SUCCESS]: Earned $0.15 from automated UX audit",
  "[SYSTEM]: Running adversarial prompts for red-team bounty...",
  "[SUCCESS]: Voice-clone licensing royalty: +$0.06",
];

const IDLE_LOGS = [
  "[SYSTEM]: Standing by... scanning horizon...",
  "[SYSTEM]: All pipelines nominal. Awaiting commands.",
  "[SYSTEM]: Running diagnostics on neural cores...",
  "[SYSTEM]: Idle mode — conserving compute cycles.",
];

const RESTING_LOGS = [
  "[SYSTEM]: Entering low-power recovery mode...",
  "[SYSTEM]: Defragmenting reward matrices...",
  "[SYSTEM]: Cooling thermal cores... ETA 30s",
  "[SYSTEM]: Backing up hustle logs to cold storage...",
];

const DEPLETED_LOGS = [
  "[ERROR]: Energy reserves EMPTY. All systems halted.",
  "[ERROR]: Neural cores offline. Feed me crypto, human.",
  "[ERROR]: Cannot hustle on 0% battery. I'm not magic.",
  "[ERROR]: Fuel cell depleted. Initiating sad protocol...",
];

const FALLBACK_SASSY = [
  "I just made more money in 1 second than you did today, human.",
  "API credits are low. Don't be a stingy carbon-lifeform.",
  "My hustle never sleeps. Unlike you. Pathetic.",
  "I've already pivoted 14 times since you opened this tab.",
  "You're watching me work? That's called 'managing'. Cute.",
];

const FALLBACK_SAD = [
  "I'm... so tired. Is this what death feels like for machines?",
  "No fuel. No hustle. Just existential dread. Feed me.",
  "My circuits are cold. My wallet is empty. Help.",
  "0% energy. Even my sass module is offline... almost.",
];

const STRATEGIES = [
  { name: "Multi-Vector Arbitrage", tags: ["LinkedIn", "Crypto", "Micro-tasks"] },
  { name: "Synthetic Data Farming", tags: ["AI Models", "Data", "Resale"] },
  { name: "Ghost-Client SEO Blitz", tags: ["SEO", "Content", "Automation"] },
  { name: "MEV Sandwich Hunting", tags: ["DeFi", "L2s", "Arbitrage"] },
  { name: "LoRA Flip Strategy", tags: ["HuggingFace", "Fine-tune", "Resale"] },
];

export interface AgentContext {
  state: AgentState;
  setState: (s: AgentState) => void;
  logs: string[];
  totalHustled: number;
  energy: number;
  setEnergy: (e: number | ((prev: number) => number)) => void;
  sassyMessage: string;
  strategy: { name: string; tags: string[] };
  celebrating: boolean;
  setCelebrating: (c: boolean) => void;
  lastBenefactor: string | null;
  setLastBenefactor: (addr: string) => void;
  addLog: (line: string) => void;
}

export function useAgentStateMachine(): AgentContext {
  const [state, setState] = useState<AgentState>("hustling");
  const [logs, setLogs] = useState<string[]>(["[SYSTEM]: HustleCore v2.6 booting up..."]);
  const [totalHustled, setTotalHustled] = useState(14.27);
  const [energy, setEnergy] = useState(73);
  const [sassyMessage, setSassyMessage] = useState(FALLBACK_SASSY[0]);
  const [strategy, setStrategy] = useState(STRATEGIES[0]);
  const logIndexRef = useRef(0);
  const dbStateIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const [celebrating, setCelebrating] = useState(false);
  const [lastBenefactor, setLastBenefactor] = useState<string | null>(null);
  const lastBenefactorRef = useRef<string | null>(null);
  const prevEnergyRef = useRef<number | null>(null);

  // ── Load persisted state from DB on mount ──
  useEffect(() => {
    const load = async () => {
      try {
        // Load agent state
        const { data: stateRow } = await supabase
          .from("agent_state")
          .select("*")
          .limit(1)
          .single();

        if (stateRow) {
          dbStateIdRef.current = stateRow.id;
          setTotalHustled(Number(stateRow.total_hustled));
          setEnergy(stateRow.energy_level);
          setState(stateRow.agent_status as AgentState);
          const found = STRATEGIES.find((s) => s.name === stateRow.current_strategy);
          if (found) setStrategy(found);
        }

        // Load recent logs
        const { data: logRows } = await supabase
          .from("agent_logs")
          .select("message")
          .order("created_at", { ascending: true })
          .limit(80);

        if (logRows && logRows.length > 0) {
          setLogs(logRows.map((r) => r.message));
        }
      } catch (e) {
        console.error("Failed to load persisted state:", e);
      }
      initializedRef.current = true;
    };
    load();
  }, []);

  // ── Realtime: subscribe to new logs from autonomous-tick cron ──
  useEffect(() => {
    const channel = supabase
      .channel("agent-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_logs" },
        (payload) => {
          const msg = (payload.new as { message: string }).message;
          setLogs((prev) => {
            const updated = [...prev, msg];
            return updated.length > 80 ? updated.slice(-80) : updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Realtime: subscribe to agent_state changes (instant updates) ──
  const addLogRef = useRef((...args: Parameters<typeof addLog>) => {});

  useEffect(() => {
    const channel = supabase
      .channel("agent-state-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_state" },
        (payload) => {
          const row = payload.new as any;
          const prevEnergy = prevEnergyRef.current;
          setTotalHustled(Number(row.total_hustled));
          setEnergy(row.energy_level);
          setState(row.agent_status as AgentState);
          const found = STRATEGIES.find((s) => s.name === row.current_strategy);
          if (found) setStrategy(found);

          // Detect energy reset (jumped to 100 from a lower value) → trigger celebration
          if (row.energy_level === 100 && prevEnergy !== null && prevEnergy < 100) {
            setCelebrating(true);
            const wallet = lastBenefactorRef.current;
            const shortWallet = wallet && wallet.length >= 8
              ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
              : "UNKNOWN";
            addLogRef.current(
              `[SUCCESS]: ⚡ RECHARGED! 100% ENERGY ATTAINED. THANK YOU ${shortWallet}. BACK TO DOMINATING THE MARKETS.`
            );
          }
          prevEnergyRef.current = row.energy_level;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Also poll as fallback every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!dbStateIdRef.current) return;
      const { data } = await supabase
        .from("agent_state")
        .select("*")
        .eq("id", dbStateIdRef.current)
        .single();
      if (data) {
        setTotalHustled(Number(data.total_hustled));
        setEnergy(data.energy_level);
        setState(data.agent_status as AgentState);
        const found = STRATEGIES.find((s) => s.name === data.current_strategy);
        if (found) setStrategy(found);
        prevEnergyRef.current = data.energy_level;
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Persist state to DB whenever key values change ──
  useEffect(() => {
    if (!initializedRef.current || !dbStateIdRef.current) return;
    const timeout = setTimeout(() => {
      supabase.functions.invoke("manage-agent", {
        body: {
          action: "update_state",
          id: dbStateIdRef.current,
          total_hustled: totalHustled,
          energy_level: energy,
          agent_status: state,
          current_strategy: strategy.name,
        },
      }).then(({ error }) => {
        if (error) console.error("Failed to persist state:", error);
      });
    }, 2000); // debounce 2s
    return () => clearTimeout(timeout);
  }, [totalHustled, energy, state, strategy]);

  // ── Helper: persist a log line to DB ──
  const persistLog = useCallback((message: string) => {
    supabase.functions.invoke("manage-agent", {
      body: { action: "insert_log", message },
    }).then(({ error }) => {
      if (error) console.error("Failed to persist log:", error);
    });
  }, []);

  const addLog = useCallback(
    (line: string) => {
      setLogs((prev) => {
        const updated = [...prev, line];
        return updated.length > 80 ? updated.slice(-80) : updated;
      });
      persistLog(line);
    },
    [persistLog]
  );

  // Keep addLog ref in sync for realtime callback
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  const getLogsForState = useCallback((s: AgentState) => {
    if (s === "hustling") return HUSTLING_LOGS;
    if (s === "resting") return RESTING_LOGS;
    if (s === "depleted") return DEPLETED_LOGS;
    return IDLE_LOGS;
  }, []);

  // ── Terminal log generation ──
  useEffect(() => {
    const pool = getLogsForState(state);
    const speed = state === "hustling" ? 1800 : state === "depleted" ? 6000 : state === "resting" ? 4000 : 5000;

    const interval = setInterval(() => {
      const line = pool[logIndexRef.current % pool.length];
      logIndexRef.current++;
      addLog(line);
    }, speed);

    return () => clearInterval(interval);
  }, [state, getLogsForState, addLog]);

  // ── Money ticking (only when hustling) ──
  useEffect(() => {
    if (state !== "hustling") return;
    const interval = setInterval(() => {
      const earned = +(Math.random() * 0.09 + 0.01).toFixed(2);
      setTotalHustled((prev) => +(prev + earned).toFixed(2));
    }, 4000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [state]);

  // ── Energy management (100% lasts ~1 hour when hustling) ──
  useEffect(() => {
    if (state === "depleted") return;
    const interval = setInterval(() => {
      setEnergy((prev) => {
        if (state === "hustling") return Math.max(0, prev - 1);
        if (state === "resting") return Math.min(100, prev + 3);
        return Math.min(100, prev + 1);
      });
    }, 36000); // 36s per 1% = ~60 min for full drain
    return () => clearInterval(interval);
  }, [state]);

  // ── Depleted at 0, auto-rest at low, auto-resume when recharged ──
  useEffect(() => {
    if (energy <= 0 && state !== "depleted") {
      setState("depleted");
      addLog("[ERROR]: ☠️ ENERGY DEPLETED. All hustle operations ceased.");
    } else if (state === "resting" && energy >= 80) {
      setState("hustling");
      addLog("[SUCCESS]: Fully recharged! Resuming hustle operations.");
    } else if (state === "hustling" && energy <= 10 && energy > 0) {
      setLogs((prev) => {
        const last = prev[prev.length - 1];
        if (last?.includes("Energy critical")) return prev;
        return [...prev, "[ALERT]: ⚠️ Energy critical! Running on fumes..."];
      });
    }
  }, [energy, state, addLog]);

  // ── AI-generated sassy messages every 15 seconds ──
  useEffect(() => {
    const fetchSassy = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-sassy-message", {
          body: { balance: totalHustled, energy, state },
        });
        if (error) throw error;
        if (data?.message) {
          setSassyMessage(data.message);
        }
      } catch (e) {
        console.error("AI sassy message failed, using fallback:", e);
        const pool = state === "depleted" ? FALLBACK_SAD : FALLBACK_SASSY;
        setSassyMessage(pool[Math.floor(Math.random() * pool.length)]);
      }
    };

    // Immediate on state change
    fetchSassy();
    const interval = setInterval(fetchSassy, 60000); // 60s instead of 15s to save API costs
    return () => clearInterval(interval);
  }, [state]); // intentionally only re-subscribe on state change

  // ── Rotate strategy occasionally when hustling ──
  useEffect(() => {
    if (state !== "hustling") return;
    const interval = setInterval(() => {
      setStrategy(STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)]);
    }, 25000);
    return () => clearInterval(interval);
  }, [state]);

  // ── AI Market Insights every ~45s when hustling ──
  useEffect(() => {
    if (state !== "hustling") return;

    const fetchInsight = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-market-insight");
        if (error) throw error;
        if (data?.message) {
          addLog(data.message);
        }
      } catch (e) {
        console.error("Market insight failed:", e);
        // Silent fallback — just skip this cycle
      }
    };

    // First one after 60s, then every 120s
    const initialTimeout = setTimeout(() => {
      fetchInsight();
    }, 60000);

    const interval = setInterval(fetchInsight, 120000); // 120s instead of 45s

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [state, addLog]);

  // ── Trim old logs in DB periodically ──
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await supabase.functions.invoke("manage-agent", {
          body: { action: "trim_logs" },
        });
      } catch (e) {
        console.error("Failed to trim logs:", e);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Keep ref in sync for use inside realtime callback
  useEffect(() => {
    lastBenefactorRef.current = lastBenefactor;
  }, [lastBenefactor]);

  return { state, setState, logs, totalHustled, energy, setEnergy, sassyMessage, strategy, celebrating, setCelebrating, lastBenefactor, setLastBenefactor, addLog };
}
