import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HcoreTokenInfo } from "@/hooks/useHcoreToken";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export interface NeuralSuggestion {
  text: string;
}

export function useNeuralSuggestions(
  userInfo: HcoreTokenInfo,
  marketCap: number | null,
  refreshTrigger?: number // increment to force refresh (e.g. after feed event)
) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const prevTriggerRef = useRef(refreshTrigger);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-neural-suggestions", {
        body: {
          marketCap,
          isHolder: userInfo.isHolder,
          tier: userInfo.tier,
        },
      });
      if (!error && data?.suggestions?.length) {
        setSuggestions(data.suggestions);
        lastFetchRef.current = Date.now();
      }
    } catch (e) {
      console.warn("Neural suggestions fetch failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [marketCap, userInfo.isHolder, userInfo.tier]);

  // Initial fetch
  useEffect(() => {
    fetchSuggestions();
  }, []);

  // Periodic refresh every 15 min
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSuggestions();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  // Refresh when feed trigger changes (e.g. after donation confirmed)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = refreshTrigger;
      fetchSuggestions();
    }
  }, [refreshTrigger, fetchSuggestions]);

  return { suggestions, isLoading, refetch: fetchSuggestions };
}
