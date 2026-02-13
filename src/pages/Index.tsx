import { motion } from "framer-motion";
import { Activity, Wifi } from "lucide-react";
import NeonCube from "@/components/NeonCube";
import Terminal from "@/components/Terminal";
import StatCards from "@/components/StatCards";
import ActionButtons from "@/components/ActionButtons";

const Index = () => {
  return (
    <div className="min-h-screen bg-background grid-bg relative overflow-hidden">
      {/* Ambient glow effects */}
      <div
        className="fixed top-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(180 100% 50% / 0.3), transparent 70%)",
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
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-neon-green" />
            <span className="text-[10px] font-mono text-neon-green text-glow-green tracking-wider">
              CONNECTED
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            NODE: US-EAST-7
          </span>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 p-6 max-w-7xl mx-auto space-y-6">
        {/* Top row: Terminal + Avatar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Terminal */}
          <div className="lg:col-span-2">
            <Terminal />
          </div>

          {/* Avatar / Neon Cube */}
          <motion.div
            className="glass rounded-lg p-6 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <NeonCube />
          </motion.div>
        </div>

        {/* Stats */}
        <StatCards />

        {/* Actions */}
        <ActionButtons />

        {/* Footer bar */}
        <motion.div
          className="glass rounded-lg px-4 py-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span>SYSTEM UPTIME: 47h 23m 11s</span>
          <span>TASKS COMPLETED: 1,247</span>
          <span className="text-neon-cyan">LATENCY: 12ms</span>
        </motion.div>
      </main>
    </div>
  );
};

export default Index;
