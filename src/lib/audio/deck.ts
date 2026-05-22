import { AudioEngine, makeImpulse } from "./engine";

/**
 * Per-deck audio graph:
 *   BufferSource -> EQ(low/mid/high) -> Filter -> Dry/Wet split
 *      |-> Dry ----------------------------\
 *      |-> Delay (feedback) -> wetGain ---+--> deckGain -> crossfaderInput
 *      |-> Convolver -> reverbWet -------/
 */
export class Deck {
  engine: AudioEngine;
  output: GainNode;

  // Filter chain (current source)
  private source: AudioBufferSourceNode | null = null;
  private sourceStart = 0; // ctx time when source started
  private sourceOffset = 0; // buffer time at start

  // Permanent nodes (rebuilt on track load? No, persistent)
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private filter: BiquadFilterNode;
  private dry: GainNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delayWet: GainNode;
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private chainInput: GainNode; // src connects here

  private buffer: AudioBuffer | null = null;
  private _playing = false;
  private _pitch = 0;

  // Loop
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  constructor(engine: AudioEngine, target: GainNode) {
    this.engine = engine;
    const ctx = engine.ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.85;
    this.output.connect(target);

    this.chainInput = ctx.createGain();

    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 200;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.8;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 4000;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "allpass";
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.7;

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.375;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.4;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.5, 2.5);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;

    // Wire: chainInput -> eq -> filter -> [dry, delay, reverb] -> output
    this.chainInput.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.filter);

    this.filter.connect(this.dry);
    this.dry.connect(this.output);

    this.filter.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay); // feedback
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.output);

    this.filter.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.output);
  }

  loadBuffer(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    this.sourceOffset = 0;
  }

  hasBuffer() {
    return this.buffer !== null;
  }

  get bufferDuration() {
    return this.buffer?.duration ?? 0;
  }

  get playing() {
    return this._playing;
  }

  /** Returns current playback position in seconds. */
  currentTime(): number {
    if (!this.buffer) return 0;
    if (!this._playing) return this.sourceOffset;
    const rate = 1 + this._pitch;
    const t = this.sourceOffset + (this.engine.ctx.currentTime - this.sourceStart) * rate;
    // Handle loop
    if (this.loopStart !== null && this.loopEnd !== null && t >= this.loopEnd) {
      // The source's own loop handles audio; for UI, wrap:
      const len = this.loopEnd - this.loopStart;
      const overshoot = (t - this.loopStart) % len;
      return this.loopStart + overshoot;
    }
    return Math.min(t, this.buffer.duration);
  }

  play(fromOffset?: number) {
    if (!this.buffer) return;
    this.stopSource();
    const ctx = this.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 1 + this._pitch;
    src.connect(this.chainInput);
    if (this.loopStart !== null && this.loopEnd !== null) {
      src.loop = true;
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    const off = fromOffset ?? this.sourceOffset;
    this.sourceOffset = off;
    this.sourceStart = ctx.currentTime;
    src.start(0, off);
    src.onended = () => {
      if (this.source === src) {
        this._playing = false;
        this.source = null;
      }
    };
    this.source = src;
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    this.sourceOffset = this.currentTime();
    this.stopSource();
    this._playing = false;
  }

  stop() {
    this.stopSource();
    this.sourceOffset = 0;
    this._playing = false;
  }

  seek(t: number) {
    const was = this._playing;
    this.stopSource();
    this.sourceOffset = Math.max(0, Math.min(this.bufferDuration, t));
    if (was) this.play(this.sourceOffset);
  }

  private stopSource() {
    if (this.source) {
      try { this.source.onended = null; this.source.stop(); } catch {}
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
  }

  setPitch(p: number) {
    this._pitch = p;
    if (this.source) {
      // Update without losing position
      this.sourceOffset = this.currentTime();
      this.sourceStart = this.engine.ctx.currentTime;
      this.source.playbackRate.setTargetAtTime(1 + p, this.engine.ctx.currentTime, 0.02);
    }
  }

  setGain(g: number) {
    this.output.gain.setTargetAtTime(g, this.engine.ctx.currentTime, 0.01);
  }

  // EQ: -1..1, mapped to ±20 dB
  setEq(low: number, mid: number, high: number) {
    const now = this.engine.ctx.currentTime;
    this.eqLow.gain.setTargetAtTime(low * 24, now, 0.01);
    this.eqMid.gain.setTargetAtTime(mid * 24, now, 0.01);
    this.eqHigh.gain.setTargetAtTime(high * 24, now, 0.01);
  }

  // Filter: -1..1, neg=LP cutoff sweep, pos=HP cutoff sweep, 0=bypass
  setFilter(v: number) {
    const now = this.engine.ctx.currentTime;
    if (Math.abs(v) < 0.02) {
      this.filter.type = "allpass";
      this.filter.frequency.setTargetAtTime(20000, now, 0.02);
      return;
    }
    if (v < 0) {
      this.filter.type = "lowpass";
      // Map -1..0 -> 200..20000 Hz (log)
      const f = Math.pow(10, 2.3 + (1 + v) * 1.7); // 200..~10000
      this.filter.frequency.setTargetAtTime(f, now, 0.02);
    } else {
      this.filter.type = "highpass";
      const f = Math.pow(10, 1.7 + v * 1.8); // 50..~3200
      this.filter.frequency.setTargetAtTime(f, now, 0.02);
    }
  }

  setDelay(mix: number) {
    this.delayWet.gain.setTargetAtTime(mix, this.engine.ctx.currentTime, 0.02);
  }

  setReverb(mix: number) {
    this.reverbWet.gain.setTargetAtTime(mix, this.engine.ctx.currentTime, 0.02);
  }

  setLoop(start: number | null, end: number | null) {
    this.loopStart = start;
    this.loopEnd = end;
    if (this.source) {
      if (start !== null && end !== null) {
        this.source.loop = true;
        this.source.loopStart = start;
        this.source.loopEnd = end;
      } else {
        this.source.loop = false;
      }
    }
  }

  clearLoop() {
    this.setLoop(null, null);
  }
}
