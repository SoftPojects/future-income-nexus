import { useState, useRef, useCallback, useEffect } from "react";

// Web Audio API procedural sound system — no external files needed
export function useAudioSystem() {
  const [muted, setMuted] = useState(true);
  const ctxRef = useRef<AudioContext | null>(null);
  const humGainRef = useRef<GainNode | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const startedRef = useRef(false);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  // ─── Ambient hum (low-freq server room drone) ───
  const startHum = useCallback(() => {
    if (startedRef.current) return;
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.value = 55; // low A
    filter.type = "lowpass";
    filter.frequency.value = 120;
    filter.Q.value = 2;
    gain.gain.value = 0; // start silent

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    humOscRef.current = osc;
    humGainRef.current = gain;
    startedRef.current = true;
  }, [getCtx]);

  // ─── Toggle mute ───
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (!next) {
        // unmuting
        startHum();
        const ctx = getCtx();
        if (ctx.state === "suspended") ctx.resume();
        if (humGainRef.current) {
          humGainRef.current.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.5);
        }
      } else {
        // muting
        const ctx = getCtx();
        if (humGainRef.current) {
          humGainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
        }
      }
      return next;
    });
  }, [startHum, getCtx]);

  // ─── UI blip (short digital click) ───
  const playBlip = useCallback(() => {
    if (muted) return;
    const ctx = getCtx();
    if (ctx.state === "suspended") return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1200 + Math.random() * 400;
    gain.gain.value = 0.06;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }, [muted, getCtx]);

  // ─── Power-up / energy surge sound ───
  const playPowerUp = useCallback(() => {
    if (muted) return;
    const ctx = getCtx();
    if (ctx.state === "suspended") return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(200, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.5);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(400, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.8);
    osc2.stop(ctx.currentTime + 0.8);
  }, [muted, getCtx]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      humOscRef.current?.stop();
      ctxRef.current?.close();
    };
  }, []);

  return { muted, toggleMute, playBlip, playPowerUp };
}
