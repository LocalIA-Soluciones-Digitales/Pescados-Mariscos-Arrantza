import { useCallback, useRef } from 'react';

// Aviso sonoro para cuando entra un pedido nuevo mientras el pescadero tiene
// el panel abierto. Mismo enfoque que useCartSound (Web Audio API, sin
// archivos externos), con un arpegio ascendente de tres notas para
// diferenciarlo del "añadido al carrito" de la web pública.
export function useOrderAlertSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Los navegadores bloquean el audio hasta que ha habido un gesto del
  // usuario en la pestaña; se llama una vez al primer clic/toque para que el
  // aviso posterior (disparado por un evento de red, no por un clic) pueda sonar.
  const unlock = useCallback(() => {
    try {
      getAudioContext();
    } catch {
      // el sonido es una mejora, no algo crítico
    }
  }, [getAudioContext]);

  const playNewOrderSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + i * 0.09;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.09, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } catch {
      // el sonido es una mejora, no algo crítico
    }
  }, [getAudioContext]);

  return { playNewOrderSound, unlock };
}
