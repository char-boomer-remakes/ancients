import type { GameSave, SimEvent, SoundArchetype, StingerId } from '../core/types';
import { TUNING } from '../data/tuning';

type AudioSettings = GameSave['settings'];
type Channel = 'sfx' | 'voice' | 'stinger';

/**
 * Procedural WebAudio layer (Phase 6 §3.12). No asset files: every cue is
 * synthesized. Cast voices key off the ability's `sound` archetype and are
 * pitch-shifted per owner timbre; capture/merge/level/badge/raid play stingers
 * on their own channel; a pooled, concurrency-capped set of "voices" keeps the
 * synth cheap under load; a global mute fully bypasses synthesis.
 */
export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private lastCoinAt = 0;
  private coinStreak = 0;

  // Voice pool (§3.12, §3.16): per-entity cast/bark voices, hard-capped.
  private voiceCap: number;
  private voiceEnds: number[] = [];
  private peakVoices = 0;

  private unlockHandler: (() => void) | null = null;

  constructor(private settings: AudioSettings, voiceCap = TUNING.audioVoiceCap) {
    this.voiceCap = Math.max(1, voiceCap);
    if (typeof window === 'undefined') return; // headless: nothing to unlock
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      this.unlockHandler = null;
    };
    this.unlockHandler = unlock;
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Resume/allow synthesis (autoplay-policy unlock). Safe to call repeatedly + headless. */
  unlock(): void {
    this.ensure();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.unlocked = true;
  }

  /** Tear down listeners + the AudioContext. Never throws. */
  dispose(): void {
    if (typeof window !== 'undefined' && this.unlockHandler) {
      window.removeEventListener('pointerdown', this.unlockHandler);
      window.removeEventListener('keydown', this.unlockHandler);
      this.unlockHandler = null;
    }
    try {
      void this.ctx?.close();
    } catch {
      /* already closed / unsupported */
    }
    this.ctx = null;
    this.unlocked = false;
    this.voiceEnds.length = 0;
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
  }

  /** Live count of active pooled voices (for perf assertions). */
  activeVoiceCount(): number {
    const t = this.now();
    let n = 0;
    for (const end of this.voiceEnds) if (end > t) n++;
    return n;
  }

  /** High-water mark of concurrent voices since construction. */
  peakVoiceCount(): number {
    return this.peakVoices;
  }

  handleEvent(ev: SimEvent): void {
    if (!this.unlocked || this.settings.audio.muted) return;
    switch (ev.t) {
      case 'cast':
        this.castVoice(ev.sound, ev.vfx.archetype, ev.timbre);
        break;
      case 'bark':
        this.barkBlip(ev.uid);
        break;
      case 'attack-impact':
        this.thump(0.055, 0.2, 520);
        break;
      case 'damage':
        if (ev.crit) this.critImpact(ev.amount);
        else if (ev.amount > 80) this.thump(0.035, 0.08, 900);
        break;
      case 'gold':
        this.coin(ev.amount, ev.reason);
        break;
      case 'heal':
        this.sweep(420, 620, 0.12, 'sine', 0.09);
        break;
      case 'reaction':
        this.reactionSound(ev.reaction);
        break;
      case 'capture-complete':
        this.playStinger('capture');
        break;
      case 'levelup':
        this.playStinger('levelup');
        break;
      case 'death':
        this.sweep(140, 48, 0.32, 'sawtooth', 0.2);
        setTimeout(() => this.noise(0.1, 0.08), 70);
        break;
      case 'item-used':
        this.sweep(260, 520, 0.08, 'square', 0.14);
        break;
      default:
        break;
    }
  }

  // ---------- voice pool ----------

  private now(): number {
    if (this.ctx) return this.ctx.currentTime;
    if (typeof performance !== 'undefined') return performance.now() / 1000;
    return Date.now() / 1000;
  }

  /** Reserve a pooled voice for `durSec`; false if the cap is saturated. */
  private requestVoice(durSec: number): boolean {
    const t = this.now();
    if (this.voiceEnds.length) {
      this.voiceEnds = this.voiceEnds.filter((end) => end > t);
    }
    if (this.voiceEnds.length >= this.voiceCap) return false;
    this.voiceEnds.push(t + durSec);
    if (this.voiceEnds.length > this.peakVoices) this.peakVoices = this.voiceEnds.length;
    return true;
  }

  // ---------- per-owner timbre ----------

  /** Stable pitch multiplier per owner timbre so a kit "sounds like theirs". */
  private timbrePitch(timbre: string | undefined): number {
    if (!timbre) return 1;
    const named: Record<string, number> = {
      sharp: 1.12,
      bright: 1.2,
      cold: 1.08,
      light: 1.15,
      warm: 0.96,
      deep: 0.82,
      booming: 0.76,
      gravel: 0.85,
      dark: 0.8,
      ethereal: 1.26
    };
    if (named[timbre] !== undefined) return named[timbre];
    let h = 0;
    for (let i = 0; i < timbre.length; i++) h = (h * 31 + timbre.charCodeAt(i)) | 0;
    return 0.88 + (Math.abs(h) % 36) / 100; // 0.88..1.23, deterministic
  }

  // ---------- cast voices (keyed off SoundArchetype) ----------

  private castVoice(sound: SoundArchetype | undefined, archetype: string, timbre: string | undefined): void {
    const dur = 0.18;
    if (!this.requestVoice(dur)) return; // pool saturated; drop this voice
    const p = this.timbrePitch(timbre);
    switch (sound) {
      case 'blade':
        this.sweep(900 * p, 1700 * p, 0.09, 'sawtooth', 0.13, 'voice');
        this.noise(0.04, 0.05);
        break;
      case 'bow':
        this.sweep(520 * p, 940 * p, 0.07, 'square', 0.11, 'voice');
        break;
      case 'impact':
        this.sweep(220 * p, 90, 0.14, 'triangle', 0.16, 'voice');
        this.thump(0.05, 0.12, 420);
        break;
      case 'frost':
        this.sweep(680 * p, 1180 * p, 0.13, 'sine', 0.12, 'voice');
        this.tone(1500 * p, 0.06, 'sine', 0.07, 'voice');
        break;
      case 'fire':
        this.sweep(300 * p, 820 * p, 0.12, 'sawtooth', 0.13, 'voice');
        this.noise(0.06, 0.07);
        break;
      case 'storm':
        this.sweep(720 * p, 1180 * p, 0.12, 'sawtooth', 0.12, 'voice');
        this.noise(0.055, 0.06);
        break;
      case 'void':
        this.sweep(300 * p, 90, 0.18, 'sine', 0.16, 'voice');
        this.tone(70, 0.16, 'triangle', 0.1, 'voice');
        break;
      case 'heal':
        this.sweep(420 * p, 720 * p, 0.16, 'sine', 0.12, 'voice');
        break;
      case 'summon':
        this.sweep(200 * p, 540 * p, 0.16, 'triangle', 0.13, 'voice');
        this.tone(540 * p, 0.08, 'sine', 0.08, 'voice');
        break;
      case 'roar':
        this.sweep(300 * p, 120 * p, 0.22, 'sawtooth', 0.2, 'voice');
        this.noise(0.08, 0.08);
        break;
      case 'item':
        this.sweep(260 * p, 520 * p, 0.08, 'square', 0.12, 'voice');
        break;
      default:
        this.castByArchetype(archetype, p);
    }
  }

  /** Fallback when an ability lacks a `sound` tag (should not happen post-lint). */
  private castByArchetype(archetype: string, p: number): void {
    switch (archetype) {
      case 'storm':
      case 'chain':
        this.sweep(720 * p, 1180 * p, 0.12, 'sawtooth', 0.12, 'voice');
        this.noise(0.055, 0.06);
        break;
      case 'ground-aoe':
      case 'wall':
        this.sweep(180 * p, 90, 0.16, 'triangle', 0.16, 'voice');
        break;
      case 'hook':
      case 'projectile':
        this.sweep(360 * p, 760 * p, 0.08, 'square', 0.1, 'voice');
        break;
      case 'shield':
        this.sweep(310 * p, 520 * p, 0.14, 'sine', 0.12, 'voice');
        break;
      default:
        this.tone(420 * p, 0.08, 'triangle', 0.16, 'voice');
    }
  }

  private barkBlip(uid: number): void {
    if (!this.requestVoice(0.1)) return;
    const p = 0.92 + (Math.abs(uid) % 8) / 24; // 0.92..1.21 per speaker
    this.tone(360 * p, 0.05, 'square', 0.08, 'voice');
    setTimeout(() => this.tone(300 * p, 0.05, 'square', 0.07, 'voice'), 55);
  }

  // ---------- stingers (own channel) ----------

  playStinger(id: StingerId): void {
    if (!this.unlocked || this.settings.audio.muted) return;
    switch (id) {
      case 'capture':
        this.arp([523, 784, 1047], 0.085, 0.16);
        break;
      case 'levelup':
        this.arp([659, 988, 1319], 0.08, 0.16);
        break;
      case 'merge': // 3-star fanfare: rising, brighter
        this.arp([523, 659, 880, 1175], 0.07, 0.15);
        break;
      case 'badge': // triumphant two-chord
        this.tone(587, 0.14, 'triangle', 0.16, 'stinger');
        this.tone(880, 0.14, 'sine', 0.12, 'stinger');
        setTimeout(() => {
          this.tone(784, 0.2, 'triangle', 0.16, 'stinger');
          this.tone(1175, 0.2, 'sine', 0.12, 'stinger');
        }, 150);
        break;
      case 'raid-clear': // big descending-then-rising motif
        this.arp([392, 523, 659, 784, 1047], 0.1, 0.18);
        setTimeout(() => this.thump(0.12, 0.14, 320), 120);
        break;
      default:
        break;
    }
  }

  private arp(freqs: number[], step: number, vol: number): void {
    freqs.forEach((f, i) => setTimeout(() => this.tone(f, step + 0.04, 'sine', vol, 'stinger'), i * step * 1000));
  }

  // ---------- low-level synth ----------

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null; // headless / unsupported
    this.ctx = new AudioContext();
    return this.ctx;
  }

  private channelGain(chan: Channel): number {
    const a = this.settings.audio;
    if (a.muted) return 0;
    return a.master * (chan === 'voice' ? a.voice : chan === 'stinger' ? a.stinger : a.sfx);
  }

  private volume(mult: number, chan: Channel): number {
    return this.channelGain(chan) * mult;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, chan: Channel = 'sfx'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(this.volume(vol, chan), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private sweep(start: number, end: number, dur: number, type: OscillatorType, vol: number, chan: Channel = 'sfx'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(start, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), ctx.currentTime + dur);
    gain.gain.setValueAtTime(this.volume(vol, chan), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private thump(dur: number, vol: number, filterHz: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const decay = 1 - i / data.length;
      data[i] = (Math.sin(i * 0.7) + (i % 5 === 0 ? 0.5 : -0.5)) * decay;
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    src.buffer = buffer;
    gain.gain.setValueAtTime(this.volume(vol, 'sfx'), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (i % 2 === 0 ? 1 : -1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(this.volume(vol, 'sfx'), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  private coin(amount: number, reason: string): void {
    const ctx = this.ensure();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.coinStreak = now - this.lastCoinAt <= 1.5 ? Math.min(8, this.coinStreak + 1) : 0;
    this.lastCoinAt = now;

    const lastHitLift = reason === 'lasthit' ? 1.09 : 1;
    const streakPitch = 2 ** (this.coinStreak / 12);
    const base = 1850 * lastHitLift * streakPitch;
    const size = Math.min(1, Math.log2(Math.max(2, amount)) / 9);
    const vol = 0.09 + size * 0.12 + (reason === 'lasthit' ? 0.04 : 0);

    this.coinRing(base, vol, 0);
    if (amount >= 45 || reason === 'echo') this.coinRing(base * 1.122, vol * 0.75, 0.075);
    if (amount >= 140 || reason === 'echo') this.coinRing(base * 1.26, vol * 0.65, 0.15);
    if (amount >= 60 || reason === 'lasthit' || reason === 'echo') this.thump(0.045, 0.05 + size * 0.06, 420);
  }

  private coinRing(freq: number, vol: number, delaySec: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delaySec;
    const dur = 0.23;
    const gain = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.value = 900;
    delay.delayTime.value = 0.045;
    feedback.gain.value = 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(this.volume(vol, 'sfx'), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    const partials: [number, number][] = [
      [1, 1],
      [1.5, 0.58],
      [2.01, 0.38]
    ];
    for (const [mul, mix] of partials) {
      const osc = ctx.createOscillator();
      const partialGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * mul, start);
      osc.frequency.exponentialRampToValueAtTime(freq * mul * 0.985, start + dur);
      partialGain.gain.value = mix;
      osc.connect(partialGain).connect(gain);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }

    gain.connect(filter).connect(ctx.destination);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(ctx.destination);
  }

  private critImpact(amount: number): void {
    const weight = Math.min(1, Math.log2(Math.max(8, amount)) / 10);
    this.sweep(2200, 760, 0.08, 'sawtooth', 0.12 + weight * 0.08);
    this.tone(3100, 0.045, 'square', 0.08 + weight * 0.05);
    this.thump(0.04, 0.1 + weight * 0.08, 760);
    setTimeout(() => this.noise(0.04, 0.045 + weight * 0.03), 18);
  }

  private reactionSound(reaction: string): void {
    const palette: Record<string, [number, number]> = {
      vaporize: [360, 940],
      melt: [420, 820],
      overload: [180, 760],
      superconduct: [620, 260],
      freeze: [760, 1180],
      swirl: [540, 1040],
      crystallize: [300, 680],
      burning: [260, 520]
    };
    const [a, b] = palette[reaction] ?? [620, 930];
    this.sweep(a, b, 0.12, reaction === 'overload' ? 'sawtooth' : 'triangle', 0.22);
    setTimeout(() => this.tone(b * 1.25, 0.07, 'sine', 0.12), 70);
  }
}
