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
  /** U5a: the per-district ambient bed (crossfaded on tram hops). */
  private bed: { gain: GainNode; stop: () => void; district: string } | null = null;
  private bedTimer: ReturnType<typeof setInterval> | null = null;
  private pendingDistrict: string | null = null;
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
    // The scene may have named a district before the first gesture.
    if (this.pendingDistrict !== null) this.setDistrictAmbient(this.pendingDistrict);
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

  // ── U5a: district ambient beds ───────────────────────────────────────────

  /**
   * Crossfade to a district's ambient bed (~1.5s, riding the tram card).
   * filament keeps its dynamo hum + murmur; the bed adds the quarter's own
   * weather: wind and far creaks in the Stacks, chirps and leaf-hiss in the
   * Terrarium, a low rumble with stray drips in the Tangle.
   */
  setDistrictAmbient(district: string): void {
    this.pendingDistrict = district;
    if (this.ctx === null) return; // unlock() replays the pending district
    if (this.bed?.district === district) return;
    const ctx = this.ctx;
    const old = this.bed;
    this.bed = null;
    if (this.bedTimer !== null) {
      clearInterval(this.bedTimer);
      this.bedTimer = null;
    }
    if (old !== null) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.45);
      setTimeout(() => old.stop(), 1800);
    }
    const built = this.buildBed(district);
    if (built === null) return;
    this.bed = { ...built, district };
    built.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    built.gain.gain.setTargetAtTime(built.level, ctx.currentTime + 0.35, 0.5);
  }

  /** One filtered-noise layer + a sparse one-shot flourish per district. */
  private buildBed(
    district: string,
  ): { gain: GainNode; stop: () => void; level: number } | null {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return null;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    src.connect(filter);
    filter.connect(gain);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    let level = 0.05;
    let flourish: (() => void) | null = null;
    switch (district) {
      case 'stacks': {
        // Rooftop wind + the occasional far-off metal creak.
        filter.type = 'bandpass';
        filter.frequency.value = 700;
        filter.Q.value = 0.5;
        lfo.frequency.value = 0.09;
        lfoGain.gain.value = 260;
        level = 0.075;
        flourish = () => {
          if (Math.random() < 0.4) this.blip('sine', 340 + Math.random() * 120, 210, 0.5, 0.018);
        };
        break;
      }
      case 'terrarium': {
        // Leaf-hiss + little glasshouse chirps.
        filter.type = 'highpass';
        filter.frequency.value = 2600;
        lfo.frequency.value = 0.16;
        lfoGain.gain.value = 500;
        level = 0.028;
        flourish = () => {
          if (Math.random() < 0.55) {
            const f = 2100 + Math.random() * 1400;
            this.blip('sine', f, f * 1.22, 0.07, 0.02);
            this.blip('sine', f * 1.1, f * 0.9, 0.05, 0.014, 0.11);
          }
        };
        break;
      }
      case 'tangle': {
        // A low rumble; sometimes a drip or a stray spark snaps.
        filter.type = 'lowpass';
        filter.frequency.value = 180;
        lfo.frequency.value = 0.06;
        lfoGain.gain.value = 50;
        level = 0.09;
        flourish = () => {
          const r = Math.random();
          if (r < 0.3) this.blip('sine', 1150, 480, 0.09, 0.03);
          else if (r < 0.42) this.blip('square', 2900, 2100, 0.03, 0.012);
        };
        break;
      }
      default: {
        // The Filament: a faint warm crackle under the dynamo/murmur pair.
        filter.type = 'bandpass';
        filter.frequency.value = 3400;
        filter.Q.value = 2.2;
        lfo.frequency.value = 0.21;
        lfoGain.gain.value = 700;
        level = 0.014;
        break;
      }
    }
    src.start();
    lfo.start();
    if (flourish !== null) this.bedTimer = setInterval(flourish, 3800);
    const stop = () => {
      try {
        src.stop();
        lfo.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
      lfo.disconnect();
      filter.disconnect();
      lfoGain.disconnect();
      gain.disconnect();
    };
    return { gain, stop, level };
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

  /** The Fortune Coil's ratchet tick (one per segment passing). */
  coilTick(): void {
    this.blip('square', 1240, 880, 0.03, 0.045);
  }

  /** A rare Manifest find — a warmer, longer chime. */
  rareChime(): void {
    this.blip('sine', 784, 784, 0.3, 0.14);
    this.blip('sine', 988, 988, 0.34, 0.12, 0.09);
    this.blip('sine', 1319, 1319, 0.42, 0.1, 0.18);
  }

  /** U5d: footsteps carry the surface — metal plating rings a little,
   *  decking knocks woody, stone keeps the dry thud. */
  footstep(surface: 'plating' | 'decking' | 'stone' = 'stone'): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    const ctx = this.ctx;
    this.stepFlip = !this.stepFlip;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (surface === 'plating') {
      f.type = 'bandpass';
      f.frequency.value = this.stepFlip ? 620 : 540;
      f.Q.value = 1.4;
      g.gain.setValueAtTime(0.085, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      // The faint metallic ring under the scuff.
      this.blip('sine', this.stepFlip ? 470 : 430, 380, 0.06, 0.02);
    } else if (surface === 'decking') {
      f.type = 'lowpass';
      f.frequency.value = this.stepFlip ? 500 : 440;
      g.gain.setValueAtTime(0.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      this.blip('triangle', this.stepFlip ? 190 : 165, 120, 0.045, 0.03);
    } else {
      f.type = 'lowpass';
      f.frequency.value = this.stepFlip ? 340 : 300;
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    }
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

  // ── U5c: the celebrations (all ≲0.3s — juice, never fanfare fatigue) ─────

  /** A Mastery level landed: a rising three-note flourish. */
  levelUpFanfare(): void {
    this.blip('triangle', 523, 523, 0.12, 0.12);
    this.blip('triangle', 659, 659, 0.12, 0.12, 0.09);
    this.blip('triangle', 784, 1046, 0.22, 0.14, 0.18);
  }

  /** A quest page stamped done. */
  questStamp(): void {
    this.blip('sine', 240, 90, 0.09, 0.2);
    this.blip('square', 1720, 1240, 0.05, 0.04, 0.05);
  }

  /** Bolts changed hands at a counter. */
  kaching(): void {
    this.blip('square', 1560, 1560, 0.05, 0.05);
    this.blip('sine', 2093, 2093, 0.16, 0.08, 0.045);
  }

  /** A donation whooshed into the Citywide Charge. */
  donationWhoosh(): void {
    if (this.ctx === null || this.master === null || this.noiseBuffer === null) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(500, t0);
    f.frequency.exponentialRampToValueAtTime(3200, t0 + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.1, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random(), 0.3);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
    this.blip('sine', 880, 1318, 0.14, 0.05, 0.16);
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
