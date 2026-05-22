import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Repeat, Disc3 } from "lucide-react";
import { Waveform } from "./Waveform";
import { Fader } from "./Fader";
import { Knob } from "./Knob";
import { useStore, type DeckId } from "@/lib/store";
import type { Deck as DeckEngine } from "@/lib/audio/deck";
import { cn } from "@/lib/utils";

interface Props {
  id: DeckId;
  deck: DeckEngine;
  positionRef: React.MutableRefObject<number>;
}

const LOOP_BEATS = [0.25, 0.5, 1, 2, 4, 8] as const;

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Deck({ id, deck, positionRef }: Props) {
  const tracks = useStore((s) => s.tracks);
  const deckState = useStore((s) => s.decks[id]);
  const setDeck = useStore((s) => s.setDeck);
  const setActiveDeck = useStore((s) => s.setActiveDeck);
  const active = useStore((s) => s.activeDeck) === id;

  const track = useMemo(
    () => tracks.find((t) => t.id === deckState.trackId) ?? null,
    [tracks, deckState.trackId],
  );

  const color = id === "A" ? "var(--color-deck-a)" : "var(--color-deck-b)";
  const glow = id === "A" ? "var(--color-deck-a-glow)" : "var(--color-deck-b-glow)";

  const togglePlay = () => {
    if (!deck.hasBuffer()) return;
    if (deck.playing) {
      deck.pause();
      setDeck(id, { playing: false });
    } else {
      deck.play();
      setDeck(id, { playing: true });
    }
  };

  const stop = () => {
    deck.stop();
    setDeck(id, { playing: false, position: 0 });
  };

  const setPitch = (v: number) => {
    deck.setPitch(v);
    setDeck(id, { pitch: v });
  };

  const setCue = (i: number) => {
    const t = deck.currentTime();
    const cues = [...deckState.cues];
    cues[i] = t;
    setDeck(id, { cues });
  };

  const triggerCue = (i: number) => {
    const c = deckState.cues[i];
    if (c === null) {
      setCue(i);
      return;
    }
    deck.seek(c);
    if (!deck.playing) {
      deck.play(c);
      setDeck(id, { playing: true });
    }
  };

  const setLoop = (beats: number | null) => {
    if (beats === null || !track?.bpm) {
      deck.clearLoop();
      setDeck(id, { loopBeats: null, loopStart: null });
      return;
    }
    const beatDur = 60 / track.bpm;
    const start = deck.currentTime();
    const end = Math.min(track.duration, start + beats * beatDur);
    deck.setLoop(start, end);
    setDeck(id, { loopBeats: beats, loopStart: start });
  };

  const [showFx, setShowFx] = useState(true);

  // Apply EQ when state changes
  useEffect(() => {
    deck.setEq(deckState.eqLow, deckState.eqMid, deckState.eqHigh);
  }, [deck, deckState.eqLow, deckState.eqMid, deckState.eqHigh]);

  useEffect(() => {
    deck.setGain(deckState.gain);
  }, [deck, deckState.gain]);

  useEffect(() => {
    deck.setFilter(deckState.filterFreq);
  }, [deck, deckState.filterFreq]);

  useEffect(() => {
    deck.setDelay(deckState.delayMix);
  }, [deck, deckState.delayMix]);

  useEffect(() => {
    deck.setReverb(deckState.reverbMix);
  }, [deck, deckState.reverbMix]);

  // Live time display
  const timeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (timeRef.current && track) {
        const t = deck.currentTime();
        positionRef.current = t;
        timeRef.current.textContent = `${fmtTime(t)} / ${fmtTime(track.duration)}`;
      } else if (timeRef.current) {
        timeRef.current.textContent = "—";
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [deck, track, positionRef]);

  return (
    <div
      onPointerDown={() => setActiveDeck(id)}
      className={cn(
        "panel p-3 md:p-4 flex flex-col gap-3 transition-shadow",
        active && (id === "A" ? "deck-a-glow" : "deck-b-glow"),
      )}
      style={{ borderColor: active ? color : undefined }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {deckState.playing ? (
            <Disc3
              size={16}
              className="spin-disc"
              style={{ color, filter: `drop-shadow(0 0 6px ${color})` }}
            />
          ) : (
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            />
          )}
          <div className="font-display text-xs tracking-widest text-muted-foreground">DECK {id}</div>
        </div>
        <div className="flex-1 min-w-0 text-center">
          <div className="truncate text-base md:text-lg font-semibold tracking-tight">
            {track?.name ?? <span className="text-muted-foreground">— no track —</span>}
          </div>
          {track?.artist && (
            <div className="truncate text-[11px] md:text-xs text-muted-foreground font-display tracking-widest uppercase mt-0.5">{track.artist}</div>
          )}
        </div>
        <div className="font-display text-xs text-muted-foreground tabular-nums">
          {track?.bpm ? `${(track.bpm * (1 + deckState.pitch)).toFixed(1)} BPM` : "—"}
        </div>
      </div>

      {/* Waveform */}
      <Waveform
        track={track}
        positionRef={positionRef}
        color={color}
        glow={glow}
        onSeek={(t) => deck.seek(t)}
        cues={deckState.cues}
        loopStart={deckState.loopStart}
        loopEnd={
          deckState.loopStart !== null && deckState.loopBeats !== null && track?.bpm
            ? deckState.loopStart + deckState.loopBeats * (60 / track.bpm)
            : null
        }
      />

      <div className="flex items-center justify-between">
        <div ref={timeRef} className="font-display text-xs text-muted-foreground" />
        <div className="font-display text-xs" style={{ color }}>
          {(1 + deckState.pitch).toFixed(3)}×
        </div>
      </div>

      {/* Transport + Pitch */}
      <div className="flex gap-3">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex gap-2">
            <button
              onClick={togglePlay}
              className="flex-1 h-14 rounded-md bg-card border border-border hover:bg-secondary active:scale-95 transition flex items-center justify-center gap-2 font-display text-sm"
              style={deckState.playing ? { borderColor: color, boxShadow: `0 0 12px ${glow}` } : undefined}
              aria-label={deckState.playing ? "Pause" : "Play"}
            >
              {deckState.playing ? <Pause size={20} /> : <Play size={20} />}
              {deckState.playing ? "PAUSE" : "PLAY"}
            </button>
            <button
              onClick={stop}
              className="h-14 w-14 rounded-md bg-card border border-border hover:bg-secondary active:scale-95 transition flex items-center justify-center"
              aria-label="Stop"
            >
              <Square size={18} />
            </button>
          </div>

          {/* Cues */}
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                onPointerDown={(e) => {
                  if (e.shiftKey) setCue(i);
                  else triggerCue(i);
                }}
                onContextMenu={(e) => { e.preventDefault(); setDeck(id, { cues: deckState.cues.map((c, j) => j === i ? null : c) }); }}
                className={cn(
                  "h-12 rounded-md border border-border font-display text-xs flex flex-col items-center justify-center transition active:scale-95",
                  deckState.cues[i] !== null ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300" : "bg-card hover:bg-secondary text-muted-foreground",
                )}
              >
                <div className="text-[10px]">CUE</div>
                <div className="text-sm">{i + 1}</div>
              </button>
            ))}
          </div>

          {/* Loop */}
          <div className="flex items-center gap-1 flex-wrap">
            <Repeat size={14} className="text-muted-foreground mr-1" />
            {LOOP_BEATS.map((b) => (
              <button
                key={b}
                onClick={() => setLoop(deckState.loopBeats === b ? null : b)}
                className={cn(
                  "flex-1 min-w-[40px] h-9 rounded-md border border-border text-xs font-display transition active:scale-95",
                  deckState.loopBeats === b
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-card hover:bg-secondary text-muted-foreground",
                )}
              >
                {b < 1 ? `1/${1 / b}` : b}
              </button>
            ))}
          </div>
        </div>

        {/* Pitch fader */}
        <Fader
          value={(deckState.pitch + 0.08) / 0.16}
          onChange={(v) => setPitch(v * 0.16 - 0.08)}
          orientation="vertical"
          label="PITCH"
          displayValue={`${(deckState.pitch * 100).toFixed(2)}%`}
          resetValue={0.5}
          className="h-full"
          trackClassName="!w-3 min-h-44"
        />
      </div>

      {/* EQ + Gain */}
      <div className="grid grid-cols-4 gap-3 mt-1">
        {(["eqHigh", "eqMid", "eqLow"] as const).map((k, idx) => (
          <div key={k} className="flex flex-col items-center">
            <Knob
              value={deckState[k]}
              onChange={(v) => setDeck(id, { [k]: v } as Partial<typeof deckState>)}
              label={["HIGH", "MID", "LOW"][idx]}
              color={color}
              resetValue={0}
              displayValue={`${(deckState[k] * 24).toFixed(0)}dB`}
            />
          </div>
        ))}
        <div className="flex flex-col items-center">
          <Knob
            value={deckState.gain}
            min={0}
            max={1}
            onChange={(v) => setDeck(id, { gain: v })}
            label="GAIN"
            color={color}
            resetValue={0.85}
            displayValue={`${Math.round(deckState.gain * 100)}`}
          />
        </div>
      </div>

      {/* FX */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">FX</div>
        <button
          onClick={() => setShowFx(!showFx)}
          className="text-[10px] text-muted-foreground hover:text-foreground font-display"
        >
          {showFx ? "HIDE" : "SHOW"}
        </button>
      </div>
      {showFx && (
        <div className="grid grid-cols-3 gap-3">
          <Knob
            value={deckState.filterFreq}
            onChange={(v) => setDeck(id, { filterFreq: v })}
            label="FILTER"
            color={color}
            resetValue={0}
            displayValue={deckState.filterFreq < -0.02 ? "LP" : deckState.filterFreq > 0.02 ? "HP" : "OFF"}
          />
          <Knob
            value={deckState.delayMix}
            min={0}
            max={1}
            onChange={(v) => setDeck(id, { delayMix: v })}
            label="DELAY"
            color={color}
            resetValue={0}
            displayValue={`${Math.round(deckState.delayMix * 100)}`}
          />
          <Knob
            value={deckState.reverbMix}
            min={0}
            max={1}
            onChange={(v) => setDeck(id, { reverbMix: v })}
            label="REVERB"
            color={color}
            resetValue={0}
            displayValue={`${Math.round(deckState.reverbMix * 100)}`}
          />
        </div>
      )}
    </div>
  );
}
