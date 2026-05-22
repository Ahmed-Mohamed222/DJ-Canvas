import { create } from "zustand";

export type DeckId = "A" | "B";

export interface Track {
  id: string;
  name: string;          // display name (metadata title if present, else filename)
  title: string | null;  // ID3/metadata title
  artist: string | null;
  album: string | null;
  duration: number;
  bpm: number | null;
  file: File;            // Raw file to defer audio decoding
  buffer?: AudioBuffer;  // Decoded audio buffer (lazy loaded)
  peaks?: Float32Array;  // Waveform peaks (lazy loaded)
}

export interface DeckState {
  trackId: string | null;
  playing: boolean;
  position: number;       // seconds (UI snapshot)
  pitch: number;          // -0.08..0.08
  gain: number;           // 0..1
  eqLow: number;          // -1..1
  eqMid: number;
  eqHigh: number;
  cues: (number | null)[]; // length 4, seconds
  loopBeats: number | null; // active loop length in beats
  loopStart: number | null;
  // FX
  filterFreq: number;     // -1..1 (negative = LP sweep, positive = HP sweep, 0 = bypass)
  delayMix: number;       // 0..1 wet
  reverbMix: number;      // 0..1 wet
}

export const initialDeck: DeckState = {
  trackId: null,
  playing: false,
  position: 0,
  pitch: 0,
  gain: 0.85,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  cues: [null, null, null, null],
  loopBeats: null,
  loopStart: null,
  filterFreq: 0,
  delayMix: 0,
  reverbMix: 0,
};

interface Store {
  tracks: Track[];
  decks: Record<DeckId, DeckState>;
  crossfader: number; // -1 (A) .. 1 (B)
  masterGain: number; // 0..1
  recording: boolean;
  activeDeck: DeckId;
  draggingTrackId: string | null; // track being dragged to a deck

  addTrack: (t: Track) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  setDeck: (id: DeckId, patch: Partial<DeckState>) => void;
  setCrossfader: (v: number) => void;
  setMaster: (v: number) => void;
  setRecording: (v: boolean) => void;
  setActiveDeck: (id: DeckId) => void;
  setDraggingTrack: (id: string | null) => void;
}

export const useStore = create<Store>((set) => ({
  tracks: [],
  decks: { A: { ...initialDeck }, B: { ...initialDeck } },
  crossfader: 0,
  masterGain: 0.85,
  recording: false,
  activeDeck: "A",
  draggingTrackId: null,

  addTrack: (t) => set((s) => ({ tracks: [...s.tracks, t] })),
  removeTrack: (id) =>
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) })),
  updateTrack: (id, patch) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  setDeck: (id, patch) =>
    set((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } })),
  setCrossfader: (v) => set({ crossfader: Math.max(-1, Math.min(1, v)) }),
  setMaster: (v) => set({ masterGain: Math.max(0, Math.min(1, v)) }),
  setRecording: (v) => set({ recording: v }),
  setActiveDeck: (id) => set({ activeDeck: id }),
  setDraggingTrack: (id) => set({ draggingTrackId: id }),
}));
