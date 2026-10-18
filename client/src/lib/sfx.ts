// Tiny synthesized sound effects, so there are no audio files to ship yet.

const MUTE_KEY = 'flipbook.muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

function audio(): AudioContext | null {
  if (muted) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, opts: { type?: OscillatorType; gain?: number; at?: number } = {}) {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(opts.gain ?? 0.08, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const sfx = {
  tick: () => tone(1200, 0.04, { type: 'square', gain: 0.025 }),
  submit: () => {
    tone(660, 0.1);
    tone(990, 0.16, { at: 0.08 });
  },
  roundStart: () => {
    tone(440, 0.08, { type: 'triangle' });
    tone(660, 0.12, { type: 'triangle', at: 0.07 });
  },
  reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', at: i * 0.09 })),
};

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}
