/**
 * AMPERIA's synthesized soundscape — no audio files, everything is WebAudio
 * primitives. Muted until the first user gesture (autoplay policy and CLAUDE
 * cozy-manners agree); the master volume persists in localStorage.
 *
 * Loops: the Great Dynamo's hum (louder as you approach) and the market
 * murmur near the stall row. One-shots: gather chirp, glint ding, footsteps,
 * UI clicks, chat pop. The flagship: the Tuner's static→lock sweep, pitch
 * tracking lock accuracy.
 */

const VOLUME_KEY = 'amperia.volume';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volumeValue: number;

  private humGain: GainNode | null = null;
  private murmurGain: GainNode | null = null;
  private tuner: {
    noiseGain: GainNode;
    noiseSrc: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    tone: OscillatorNode;
    toneGain: GainNode;
  } | null = null;
  private stepFlip = false;

  constructor() {
    const raw = localStorage.getItem(VOLUME_KEY);
    const stored = raw === null ? NaN : Number(raw);
    this.volumeValue = Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.5;
  }

  get volume(): number {
    return this.volumeValue;
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Call from the first pointer/key gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx !== null) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumeValue * this.volumeValue; // perceptual-ish taper
    this.master.connect(this.ctx.destination);
    // Shared 1s white-noise loop source material.
    this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.startLoops();
  }

  setVolume(v: number): void {
    this.volumeValue = Math.max(0, Math.min(1, v));
    localStorage.setItem(VOLUME_KEY, String(this.volumeValue));
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(
        this.volumeValue * this.volumeValue,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  // ── ambient loops ────────────────────────────────────────────────────────

  private startLoops(): void {
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;

    // Dynamo hum: two detuned lows + a slow shimmer LFO on the upper one.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 320;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 110.7; // detuned against A's second harmonic
    const oscBGain = ctx.createGain();
    oscBGain.gain.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.14;
    lfo.connect(lfoGain);
    lfoGain.connect(oscBGain.gain);
    oscA.connect(humFilter);
    oscB.connect(oscBGain);
    oscBGain.connect(humFilter);
    humFilter.connect(this.humGain);
    this.humGain.connect(master);
    oscA.start();
    oscB.start();
    lfo.start();

    // Market murmur: band-passed noise, very quiet, swells slowly.
    this.murmurGain = ctx.createGain();
    this.murmurGain.gain.value = 0;
    const murmurSrc = ctx.createBufferSource();
    murmurSrc.buffer = this.noiseBuffer;
    murmurSrc.loop = true;
    const murmurFilter = ctx.createBiquadFilter();
    murmurFilter.type = 'bandpass';
    murmurFilter.frequency.value = 420;
    murmurFilter.Q.value = 0.8;
    const murmurLfo = ctx.createOscillator();
    murmurLfo.frequency.value = 0.07;
    const murmurLfoGain = ctx.createGain();
    murmurLfoGain.gain.value = 60;
    murmurLfo.connect(murmurLfoGain);
    murmurLfoGain.connect(murmurFilter.frequency);
    murmurSrc.connect(murmurFilter);
    murmurFilter.connect(this.murmurGain);
    this.murmurGain.connect(master);
    murmurSrc.start();
    murmurLfo.start();
  }

  /** Distance-driven loop levels; call a few times a second from the scene. */
  updateSpatial(distToDynamoPx: number, distToStallsPx: number): void {
    if (this.ctx === null) return;
    const t = this.ctx.currentTime;
    const humLevel = Math.pow(Math.max(0, 1 - distToDynamoPx / 1500), 1.7) * 0.32;
    this.humGain?.gain.setTargetAtTime(humLevel, t, 0.25);
    const murmurLevel = Math.pow(Math.max(0, 1 - distToStallsPx / 1100), 1.6) * 0.11;
    this.murmurGain?.gain.setTargetAtTime(murmurLevel, t, 0.4);
  }

  // ── one-shots ────────────────────────────────────────────────────────────

  private blip(
    type: OscillatorType,
    f0: number,
    f1: number,
    seconds: number,
    peak: number,
    delay = 0,
  ): void {
    if (this.ctx === null || this.master === null) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** A stack landed in the pack. */
  gatherChirp(): void {
    this.blip('sine', 620, 930, 0.09, 0.16);
    this.blip('sine', 930, 1240, 0.07, 0.1, 0.06);
  }

  /** The glint-spot popped — grab it. */
  glintDing(): void {
    this.blip('triangle', 1318, 1318, 0.16, 0.14);
    this.blip('triangle', 1976, 1976, 0.22, 0.08, 0.03);
  }

  /** A rare Manifest find — a warmer, longer chime. */
  rareChime(): void {
    this.blip('sine', 784, 784, 0.3, 0.14);
    this.blip('sine', 988, 988, 0.34, 0.12, 0.09);
    this.blip('sine', 1319, 1319, 0.42, 0.1, 0.18);
  }

  footstep(): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    const ctx = this.ctx;
    this.stepFlip = !this.stepFlip;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.stepFlip ? 340 : 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random(), 0.06);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }

  uiClick(): void {
    this.blip('square', 840, 660, 0.035, 0.05);
  }

  chatPop(): void {
    this.blip('sine', 520, 392, 0.09, 0.09);
  }

  hurtThud(): void {
    this.blip('sine', 180, 70, 0.16, 0.2);
  }

  swingWhiff(): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t0);
    f.frequency.exponentialRampToValueAtTime(2400, t0 + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random(), 0.1);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }

  // ── the flagship: tuner static → lock sweep ─────────────────────────────

  tunerStart(): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    this.tunerStop();
    const ctx = this.ctx;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;
    noiseSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.11;
    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.master);
    noiseSrc.start();

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 240;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0;
    tone.connect(toneGain);
    toneGain.connect(this.master);
    tone.start();

    this.tuner = { noiseGain, noiseSrc, filter, tone, toneGain };
  }

  /** accuracy 0..1 (1 = dead-on the station). Static fades, the tone rises. */
  tunerUpdate(accuracy: number): void {
    if (this.ctx === null || this.tuner === null) return;
    const a = Math.max(0, Math.min(1, accuracy));
    const t = this.ctx.currentTime;
    this.tuner.noiseGain.gain.setTargetAtTime(0.12 * (1 - a * a), t, 0.08);
    this.tuner.filter.frequency.setTargetAtTime(1400 - a * 900, t, 0.1);
    this.tuner.tone.frequency.setTargetAtTime(240 + a * 420, t, 0.07);
    this.tuner.toneGain.gain.setTargetAtTime(a > 0.55 ? 0.09 * a : 0, t, 0.09);
  }

  tunerStop(): void {
    if (this.tuner === null) return;
    const { noiseGain, noiseSrc, tone, toneGain } = this.tuner;
    this.tuner = null;
    if (this.ctx === null) return;
    const t = this.ctx.currentTime;
    noiseGain.gain.setTargetAtTime(0, t, 0.05);
    toneGain.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      noiseSrc.stop();
      tone.stop();
      noiseSrc.disconnect();
      tone.disconnect();
      noiseGain.disconnect();
      toneGain.disconnect();
    }, 400);
  }
}

export const sound = new SoundEngine();
