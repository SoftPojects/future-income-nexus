import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks total real SOL donated via the donations table.
 */
export function useTotalSolDonated() {
  const [totalSol, setTotalSol] = useState(0);

  const refresh = async () => {
    const { data } = await supabase
      .from("donations")
      .select("amount_sol");
    if (data) {
      const sum = data.reduce((acc, row) => acc + Number(row.amount_sol), 0);
      setTotalSol(sum);
    }
  };

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel("donations-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "donations" },
        () => refresh()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { totalSol, refresh };
}
