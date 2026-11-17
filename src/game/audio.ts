export type AudioBus = {
  unlock: () => void;
  hum: (level: number) => void;
  spray: (level: number, bright: boolean) => void;
  hit: (heavy: number) => void;
  spark: () => void;
  alarm: () => void;
  ui: () => void;
  win: () => void;
  meltdown: () => void;
  foot: () => void;
  dispose: () => void;
};

export function createAudio(): AudioBus {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let humGain: GainNode | null = null;
  let sprayGain: GainNode | null = null;
  let sprayFilter: BiquadFilterNode | null = null;
  let lastSpark = 0;
  let lastAlarm = 0;

  function ac() {
    if (!ctx) {
      const Ctx = window.AudioContext;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function noise(duration: number, freq: number, type: BiquadFilterType, gain: number) {
    const c = ac();
    if (!master) return;
    const frames = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(Math.max(0.001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    src.stop(t + duration + 0.02);
  }

  function toneAt(when: number, freq: number, dur: number, gain: number, type: OscillatorType) {
    const c = ac();
    if (!master) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(Math.max(0.001, gain), when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  return {
    unlock() {
      const c = ac();
      if (!master || humGain) return;
      const frames = c.sampleRate * 2;
      const buffer = c.createBuffer(1, frames, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 150;
      humGain = c.createGain();
      humGain.gain.value = 0;
      src.connect(filter);
      filter.connect(humGain);
      humGain.connect(master);
      src.start();

      const sprayBuffer = c.createBuffer(1, frames, c.sampleRate);
      const sprayData = sprayBuffer.getChannelData(0);
      for (let i = 0; i < frames; i++) sprayData[i] = Math.random() * 2 - 1;
      const spraySrc = c.createBufferSource();
      spraySrc.buffer = sprayBuffer;
      spraySrc.loop = true;
      sprayFilter = c.createBiquadFilter();
      sprayFilter.type = "bandpass";
      sprayFilter.frequency.value = 1800;
      sprayGain = c.createGain();
      sprayGain.gain.value = 0;
      spraySrc.connect(sprayFilter);
      sprayFilter.connect(sprayGain);
      sprayGain.connect(master);
      spraySrc.start();
    },
    hum(level) {
      if (humGain) humGain.gain.value = level;
    },
    spray(level, bright) {
      if (!sprayGain || !sprayFilter) return;
      sprayGain.gain.value = level;
      sprayFilter.frequency.value = bright ? 900 : 2100;
    },
    hit(heavy) {
      noise(0.09 + heavy * 0.06, 140 + heavy * 80, "lowpass", 0.35 + heavy * 0.25);
      const t = ac().currentTime;
      toneAt(t, 70 + heavy * 40, 0.08, 0.12, "square");
    },
    spark() {
      const now = performance.now();
      if (now - lastSpark < 80) return;
      lastSpark = now;
      noise(0.045, 2800, "highpass", 0.16);
    },
    alarm() {
      const now = performance.now();
      if (now - lastAlarm < 700) return;
      lastAlarm = now;
      const t = ac().currentTime;
      toneAt(t, 880, 0.09, 0.06, "square");
      toneAt(t + 0.1, 620, 0.12, 0.045, "square");
    },
    ui() {
      const t = ac().currentTime;
      toneAt(t, 540, 0.05, 0.05, "sine");
      toneAt(t + 0.05, 760, 0.07, 0.04, "sine");
    },
    win() {
      const t = ac().currentTime;
      toneAt(t, 523, 0.1, 0.07, "sine");
      toneAt(t + 0.11, 659, 0.1, 0.07, "sine");
      toneAt(t + 0.22, 784, 0.2, 0.08, "sine");
    },
    meltdown() {
      noise(0.55, 180, "lowpass", 0.5);
      const t = ac().currentTime;
      toneAt(t, 80, 0.45, 0.16, "sawtooth");
    },
    foot() {
      noise(0.035, 280, "lowpass", 0.05);
    },
    dispose() {
      void ctx?.close();
      ctx = null;
      humGain = null;
      sprayGain = null;
      master = null;
    },
  };
}
