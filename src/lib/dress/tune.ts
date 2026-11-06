const STEP = 64;

const BASS = [
  "C2", null, "C2", null, "G2", null, "E2", null,
  "C2", null, "G2", null, "C3", null, "G2", null,
  "A1", null, "A1", null, "E2", null, "A2", null,
  "F2", null, "C2", null, "F2", null, "A2", null,
  "F2", null, "C2", null, "A2", null, "C3", null,
  "G2", null, "D2", null, "B2", null, "G2", null,
  "C2", null, "E2", null, "G2", null, "E2", null,
  "F2", null, "E2", null, "D2", null, "G1", null,
];

const LEAD = [
  null, null, "E5", null, "G5", null, "C6", "E6",
  null, "D6", null, "C6", "A5", null, "G5", null,
  null, "C5", null, "E5", "A5", null, "G5", "E5",
  null, "F5", null, "A5", "C6", null, "A5", null,
  null, "A5", "C6", null, "F6", null, "E6", "C6",
  null, "B5", null, "G5", "D6", null, "B5", null,
  "C6", null, "E6", null, "G6", "E6", "D6", null,
  "C6", null, null, "G5", null, "E5", null, null,
];

function bounce(notes: string[], count: number) {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(notes[i % notes.length]!);
  return out;
}

const ARP = [
  ...bounce(["C5", "E5", "G5", "C6"], 16),
  ...bounce(["A4", "C5", "E5", "A5"], 8),
  ...bounce(["F4", "A4", "C5", "F5"], 8),
  ...bounce(["F4", "A4", "C5", "F5"], 8),
  ...bounce(["G4", "B4", "D5", "G5"], 8),
  ...bounce(["C5", "E5", "G5", "C6"], 8),
  ...bounce(["B4", "D5", "F5", "G5"], 4),
  ...bounce(["C5", "E5", "G5", "C6"], 4),
];

const MIDI: Record<string, number> = {};
for (const [name, semitone] of [
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["Bb", 10],
  ["B", 11],
] as const) {
  for (let octave = 1; octave <= 7; octave += 1) {
    MIDI[`${name}${octave}`] = 12 * (octave + 1) + semitone;
  }
}

function freq(note: string) {
  return 440 * 2 ** ((MIDI[note]! - 69) / 12);
}

function pulseWave(ctx: AudioContext, duty: number) {
  const n = 64;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 1; i < n; i += 1) {
    imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export function createTune() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer = 0;
  let step = 0;
  let next = 0;
  let playing = false;
  let want = false;
  let lastLead = 0;
  const waves = new Map<number, PeriodicWave>();

  function context() {
    if (ctx) return ctx;
    const audio = new AudioContext();
    ctx = audio;
    master = audio.createGain();
    master.gain.value = 0.0001;
    filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.Q.value = 2.4;
    master.connect(filter);
    filter.connect(audio.destination);
    const samples = audio.sampleRate;
    noise = audio.createBuffer(1, samples, samples);
    const data = noise.getChannelData(0);
    for (let i = 0; i < samples; i += 1) data[i] = Math.random() * 2 - 1;
    return audio;
  }

  function pulse(duty: number) {
    const audio = context();
    const key = Math.round(duty * 100);
    let wave = waves.get(key);
    if (!wave) {
      wave = pulseWave(audio, duty);
      waves.set(key, wave);
    }
    return wave;
  }

  function env(time: number, dur: number, gain: number, attack = 0.012) {
    const audio = context();
    const amp = audio.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    return amp;
  }

  function triangle(time: number, note: string, dur: number, gain: number) {
    const audio = context();
    if (!master) return;
    const osc = audio.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq(note), time);
    const amp = env(time, dur, gain, 0.008);
    osc.connect(amp);
    amp.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function tone(time: number, note: string, dur: number, gain: number, duty: number, slide = false) {
    const audio = context();
    if (!master) return;
    const osc = audio.createOscillator();
    osc.setPeriodicWave(pulse(duty));
    const f = freq(note);
    if (slide && lastLead > 0) {
      osc.frequency.setValueAtTime(lastLead, time);
      osc.frequency.exponentialRampToValueAtTime(f, time + 0.045);
    } else {
      osc.frequency.setValueAtTime(f, time);
    }
    if (slide) lastLead = f;
    const amp = env(time, dur, gain, 0.01);
    osc.connect(amp);
    amp.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function drum(time: number, snare: boolean) {
    const audio = context();
    if (!master || !noise) return;
    const src = audio.createBufferSource();
    src.buffer = noise;
    const amp = audio.createGain();
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = snare ? 0.7 : 1.4;
    band.frequency.setValueAtTime(snare ? 1800 : 240, time);
    band.frequency.exponentialRampToValueAtTime(snare ? 900 : 80, time + (snare ? 0.09 : 0.12));
    amp.gain.setValueAtTime(snare ? 0.16 : 0.28, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + (snare ? 0.1 : 0.14));
    src.connect(band);
    band.connect(amp);
    amp.connect(master);
    src.start(time);
    src.stop(time + 0.16);
  }

  function play(index: number, time: number) {
    const bass = BASS[index];
    const lead = LEAD[index];
    const arp = ARP[index];
    const beat = index % 8;
    if (bass) triangle(time, bass, beat === 0 ? 0.22 : 0.14, 0.42);
    if (lead) tone(time, lead, 0.2, 0.12, 0.32, true);
    if (beat === 0) drum(time, false);
    else if (beat === 4) drum(time, true);
    else if (arp) tone(time, arp, 0.09, 0.055, 0.12, false);
  }

  function tick() {
    const audio = context();
    const horizon = audio.currentTime + 0.18;
    const gap = 60 / 128 / 4;
    const sweep = 1100 + (Math.sin((step / STEP) * Math.PI * 2) * 0.5 + 0.5) * 1700;
    filter?.frequency.setTargetAtTime(sweep, audio.currentTime, 0.12);
    while (next < horizon) {
      play(step, next);
      next += gap;
      step = (step + 1) % STEP;
    }
  }

  function begin() {
    const audio = context();
    if (!master || playing) return;
    master.gain.cancelScheduledValues(audio.currentTime);
    master.gain.setValueAtTime(0.0001, audio.currentTime);
    master.gain.setTargetAtTime(0.2, audio.currentTime, 0.06);
    next = audio.currentTime + 0.05;
    step = 0;
    lastLead = 0;
    playing = true;
    tick();
    timer = window.setInterval(tick, 40);
  }

  function stop() {
    want = false;
    playing = false;
    window.clearInterval(timer);
    if (master && ctx) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
  }

  function start() {
    want = true;
    const audio = context();
    if (playing) return true;
    if (audio.state === "suspended") {
      void audio.resume().then(() => {
        if (want) begin();
      });
      return false;
    }
    begin();
    return true;
  }

  function toggle() {
    if (playing || want) {
      stop();
      return false;
    }
    start();
    return true;
  }

  return {
    start,
    toggle,
    stop,
    get playing() {
      return playing;
    },
    get wanted() {
      return want;
    },
  };
}
