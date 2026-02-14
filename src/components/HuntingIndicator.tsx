import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const HuntingIndicator = () => {
  const [lastTarget, setLastTarget] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("target_agents" as any)
        .select("x_handle, last_roasted_at")
        .not("last_roasted_at", "is", null)
        .order("last_roasted_at", { ascending: false })
        .limit(1);
      if (data?.[0]) setLastTarget((data[0] as any).x_handle);
    };
    fetch();
  }, []);

  if (!lastTarget) return null;

  return (
    <motion.div
      className="flex items-center gap-2 text-[10px] font-mono"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Crosshair className="w-3 h-3 text-destructive" />
      </motion.div>
      <span className="text-destructive tracking-wider">
        HUNTING: @{lastTarget}
      </span>
    </motion.div>
  );
};

export default HuntingIndicator;
