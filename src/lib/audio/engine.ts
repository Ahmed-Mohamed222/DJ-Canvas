import { encodeWav } from "./wav-encoder";

/**
 * Master audio engine: singleton AudioContext, crossfader bus, master gain, recorder.
 * Per-deck graphs (see Deck class) connect into one of two crossfader inputs.
 */
export class AudioEngine {
  ctx: AudioContext;
  // Crossfader inputs (gain stage per deck)
  inA: GainNode;
  inB: GainNode;
  // Master
  master: GainNode;
  // Recorder tap
  private recScript: ScriptProcessorNode | null = null;
  private recBuffers: Float32Array[][] = [];

  constructor() {
    const Ctor = (window.AudioContext ||
      (window as any).webkitAudioContext) as typeof AudioContext;
    this.ctx = new Ctor({ latencyHint: "interactive" });
    this.inA = this.ctx.createGain();
    this.inB = this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.inA.connect(this.master);
    this.inB.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.setCrossfader(0);
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setCrossfader(v: number) {
    // Equal-power crossfade. v in [-1, 1].
    const x = (v + 1) / 2; // 0..1
    const gA = Math.cos((x * Math.PI) / 2);
    const gB = Math.cos(((1 - x) * Math.PI) / 2);
    const now = this.ctx.currentTime;
    this.inA.gain.setTargetAtTime(gA, now, 0.01);
    this.inB.gain.setTargetAtTime(gB, now, 0.01);
  }

  setMaster(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  // ---- Recording (PCM capture via ScriptProcessor for WAV output) ----
  private recSilent: GainNode | null = null;

  startRecording() {
    if (this.recScript) return;
    const sp = this.ctx.createScriptProcessor(4096, 2, 2);
    this.recBuffers = [[], []];
    sp.onaudioprocess = (e) => {
      const l = e.inputBuffer.getChannelData(0);
      const r = e.inputBuffer.getChannelData(1);
      this.recBuffers[0].push(new Float32Array(l));
      this.recBuffers[1].push(new Float32Array(r));
    };
    // Wire: master → sp → silent(gain=0) → destination
    // The SP needs a connected output to stay alive, but we mute it
    // so audio isn't heard twice. master→sp feeds audio INTO the SP.
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    this.master.connect(sp);
    sp.connect(silent);
    silent.connect(this.ctx.destination);
    this.recScript = sp;
    this.recSilent = silent;
  }

  async stopRecording(): Promise<Blob | null> {
    if (!this.recScript) return null;
    try { this.master.disconnect(this.recScript); } catch {}
    try { this.recScript.disconnect(); } catch {}
    try { this.recSilent?.disconnect(); } catch {}
    const sp = this.recScript;
    this.recScript = null;
    this.recSilent = null;
    sp.onaudioprocess = null;

    const [lChunks, rChunks] = this.recBuffers;
    const total = lChunks.reduce((s, c) => s + c.length, 0);
    const interleaved = new Float32Array(total * 2);
    let off = 0;
    for (let i = 0; i < lChunks.length; i++) {
      const l = lChunks[i];
      const r = rChunks[i];
      for (let j = 0; j < l.length; j++) {
        interleaved[off++] = l[j];
        interleaved[off++] = r[j];
      }
    }
    this.recBuffers = [];
    return encodeWav(interleaved, this.ctx.sampleRate, 2);
  }
}

let _engine: AudioEngine | null = null;
export function getEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}

/** Generate a simple reverb impulse response (algorithmic). */
export function makeImpulse(ctx: AudioContext, duration = 2, decay = 2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = rate * duration;
  const impulse = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}
