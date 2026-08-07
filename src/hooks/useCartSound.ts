import { useCallback, useRef } from 'react';

/**
 * Synthesizes a subtle, premium "add to cart" chime using the Web Audio API.
 * No external audio files — instant, lightweight, and consistent across devices.
 *
 * Sound profile: two ascending sine-wave plucks with a gentle decay,
 * resembling a refined notification chime (~180ms total).
 */
export function useCartSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playAddToCartSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // First note — lower pitch, slightly shorter
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);        // A5
      osc1.frequency.exponentialRampToValueAtTime(1100, now + 0.06); // gentle rise to C#6
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.08, now + 0.015);  // quick attack
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15); // smooth decay
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Second note — higher harmonic, slightly delayed, shorter
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.06); // E6
      osc2.frequency.exponentialRampToValueAtTime(1568, now + 0.11); // gentle rise to G6
      gain2.gain.setValueAtTime(0, now + 0.06);
      gain2.gain.linearRampToValueAtTime(0.06, now + 0.075);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.22);
    } catch {
      // Silently fail — sound is an enhancement, not critical
    }
  }, [getAudioContext]);

  const playUndoSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Soft descending pluck — understated "item removed" feedback
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);          // E5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.07); // gentle fall to A4
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch {
      // Silently fail
    }
  }, [getAudioContext]);

  return { playAddToCartSound, playUndoSound };
}
