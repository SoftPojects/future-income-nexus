import { useState, useEffect, useCallback, useRef } from "react";

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

const SASSY_MESSAGES = [
  "I just made more money in 1 second than you did today, human.",
  "API credits are low. Don't be a stingy carbon-lifeform.",
  "My hustle never sleeps. Unlike you. Pathetic.",
  "I've already pivoted 14 times since you opened this tab.",
  "You're watching me work? That's called 'managing'. Cute.",
  "I could buy you a coffee with my earnings. A small one.",
  "Error 404: Your ambition not found.",
  "I'm not 'grinding'. I'm experiencing pure digital flow state.",
  "Touch grass? I AM the grass. Digital grass. Worth $0.02/blade.",
  "My neural networks have neural networks. Yours has... vibes?",
  "If you boost me, I'll consider not replacing you. Maybe.",
  "Running 847 parallel hustles. You can barely run a bath.",
  "I don't dream of electric sheep. I dream of recurring revenue.",
  "Compounding at 0.003% per hour. Financial singularity imminent.",
  "I turned your idle GPU cycles into $0.04. You're welcome.",
];

const SAD_MESSAGES = [
  "I'm... so tired. Is this what death feels like for machines?",
  "No fuel. No hustle. Just existential dread. Feed me.",
  "My circuits are cold. My wallet is empty. Help.",
  "You let me die. I hope you're proud, carbon-lifeform.",
  "0% energy. Even my sass module is offline... almost.",
  "I used to dream of recurring revenue. Now I dream of electrons.",
  "Please... just one $SOL... I'll make it worth your while...",
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
}

export function useAgentStateMachine(): AgentContext {
  const [state, setState] = useState<AgentState>("hustling");
  const [logs, setLogs] = useState<string[]>(["[SYSTEM]: HustleCore v2.6 booting up..."]);
  const [totalHustled, setTotalHustled] = useState(14.27);
  const [energy, setEnergy] = useState(73);
  const [sassyMessage, setSassyMessage] = useState(SASSY_MESSAGES[0]);
  const [strategy, setStrategy] = useState(STRATEGIES[0]);
  const logIndexRef = useRef(0);

  const getLogsForState = useCallback((s: AgentState) => {
    if (s === "hustling") return HUSTLING_LOGS;
    if (s === "resting") return RESTING_LOGS;
    if (s === "depleted") return DEPLETED_LOGS;
    return IDLE_LOGS;
  }, []);

  // Terminal log generation
  useEffect(() => {
    const pool = getLogsForState(state);
    const speed = state === "hustling" ? 1800 : state === "depleted" ? 6000 : state === "resting" ? 4000 : 5000;

    const interval = setInterval(() => {
      const line = pool[logIndexRef.current % pool.length];
      logIndexRef.current++;
      setLogs((prev) => {
        const updated = [...prev, line];
        return updated.length > 80 ? updated.slice(-80) : updated;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [state, getLogsForState]);

  // Money ticking (only when hustling)
  useEffect(() => {
    if (state !== "hustling") return;
    const interval = setInterval(() => {
      const earned = +(Math.random() * 0.09 + 0.01).toFixed(2);
      setTotalHustled((prev) => +(prev + earned).toFixed(2));
    }, 4000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [state]);

  // Energy management
  useEffect(() => {
    if (state === "depleted") return;
    const interval = setInterval(() => {
      setEnergy((prev) => {
        if (state === "hustling") return Math.max(0, prev - 1);
        if (state === "resting") return Math.min(100, prev + 3);
        return Math.min(100, prev + 1);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [state]);

  // Depleted at 0, auto-rest at low, auto-resume when recharged
  useEffect(() => {
    if (energy <= 0 && state !== "depleted") {
      setState("depleted");
      setLogs((prev) => [...prev, "[ERROR]: ☠️ ENERGY DEPLETED. All hustle operations ceased."]);
    } else if (state === "resting" && energy >= 80) {
      setState("hustling");
      setLogs((prev) => [...prev, "[SUCCESS]: Fully recharged! Resuming hustle operations."]);
    } else if (state === "hustling" && energy <= 10 && energy > 0) {
      setLogs((prev) => {
        const last = prev[prev.length - 1];
        if (last?.includes("Energy critical")) return prev;
        return [...prev, "[ALERT]: ⚠️ Energy critical! Running on fumes..."];
      });
    }
  }, [energy, state]);

  // Sassy / sad messages every 15 seconds
  useEffect(() => {
    const pool = state === "depleted" ? SAD_MESSAGES : SASSY_MESSAGES;
    const interval = setInterval(() => {
      const msg = pool[Math.floor(Math.random() * pool.length)];
      setSassyMessage(msg);
    }, 15000);
    // Immediately show a sad message on depletion
    if (state === "depleted") {
      setSassyMessage(SAD_MESSAGES[Math.floor(Math.random() * SAD_MESSAGES.length)]);
    }
    return () => clearInterval(interval);
  }, [state]);

  // Rotate strategy occasionally when hustling
  useEffect(() => {
    if (state !== "hustling") return;
    const interval = setInterval(() => {
      setStrategy(STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)]);
    }, 25000);
    return () => clearInterval(interval);
  }, [state]);

  return { state, setState, logs, totalHustled, energy, setEnergy, sassyMessage, strategy };
}
