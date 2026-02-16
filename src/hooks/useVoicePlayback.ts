import { useState, useCallback, useRef, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function useVoicePlayback() {
  const [autoPlay, setAutoPlay] = useState(() => {
    try { return localStorage.getItem("hustlecore_neural_voice") === "true"; } catch { return false; }
  });
  const [playingId, setPlayingId] = useState<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    try { localStorage.setItem("hustlecore_neural_voice", String(autoPlay)); } catch {}
  }, [autoPlay]);

  const playText = useCallback(async (text: string, id?: string) => {
    // Strip log prefixes for cleaner speech
    const cleanText = text
      .replace(/^\[(?:SYSTEM|SUCCESS|ALERT|ERROR|DATA|TIP)\]:\s*/i, "")
      .replace(/[⚡☠️⚠️◈]/g, "")
      .trim();
    
    if (!cleanText || cleanText.length < 5) return;

    const cacheKey = cleanText.slice(0, 80);

    try {
      setPlayingId(id || cacheKey);
      let audioUrl = cacheRef.current.get(cacheKey);

      if (!audioUrl) {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/tts-speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ text: cleanText }),
        });

        if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        cacheRef.current.set(cacheKey, audioUrl);

        // Limit cache size
        if (cacheRef.current.size > 20) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey) {
            const url = cacheRef.current.get(firstKey);
            if (url) URL.revokeObjectURL(url);
            cacheRef.current.delete(firstKey);
          }
        }
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.volume = 0.7;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback error"));
        audio.play().catch(reject);
      });
    } catch (e) {
      console.error("Voice playback failed:", e);
    } finally {
      setPlayingId(null);
    }
  }, []);

  // Queue-based auto-play for terminal logs
  const enqueueAutoPlay = useCallback((text: string) => {
    if (!autoPlay) return;
    queueRef.current.push(text);
    processQueue();
  }, [autoPlay, playText]);

  const processQueue = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    isPlayingRef.current = true;
    
    const text = queueRef.current.shift()!;
    await playText(text);
    
    isPlayingRef.current = false;
    // Process next in queue
    if (queueRef.current.length > 0) {
      // Only keep latest 2 to avoid backlog
      if (queueRef.current.length > 2) {
        queueRef.current = queueRef.current.slice(-2);
      }
      processQueue();
    }
  }, [playText]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlay(prev => !prev);
  }, []);

  return { playText, playingId, autoPlay, toggleAutoPlay, enqueueAutoPlay };
}
