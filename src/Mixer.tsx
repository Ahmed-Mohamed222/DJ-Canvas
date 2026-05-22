import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { getEngine } from "@/lib/audio/engine";
import { Deck as DeckEngine } from "@/lib/audio/deck";
import { useStore, type DeckId } from "@/lib/store";
import { useKeyboard } from "@/lib/input/use-keyboard";
import { Music } from "lucide-react";
import { Deck } from "@/components/Deck";
import { Crossfader } from "@/components/Crossfader";
import { MasterBar } from "@/components/MasterBar";
import { Library } from "@/components/Library";
import { Fader } from "@/components/Fader";
import { cn } from "@/lib/utils";
import { extractPeaks } from "@/lib/audio/waveform";
import { detectBPM } from "@/lib/audio/bpm";


export function Mixer() {
  const tracks = useStore((s) => s.tracks);
  const decksState = useStore((s) => s.decks);
  const crossfader = useStore((s) => s.crossfader);
  const setCrossfader = useStore((s) => s.setCrossfader);
  const setDeck = useStore((s) => s.setDeck);
  const setMaster = useStore((s) => s.setMaster);
  const master = useStore((s) => s.masterGain);
  const activeDeck = useStore((s) => s.activeDeck);
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  const draggingTrackId = useStore((s) => s.draggingTrackId);

  const enginesRef = useRef<{ A: DeckEngine; B: DeckEngine } | null>(null);
  const positionRefs = {
    A: useRef(0),
    B: useRef(0),
  };

  // Drop zone hover state
  const [dropHover, setDropHover] = useState<DeckId | null>(null);

  // Library expanded & resizing state
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
  const [libraryHeight, setLibraryHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onPointerMove = (e: PointerEvent) => {
      const newHeight = window.innerHeight - e.clientY - 24;
      const minHeight = 150;
      const maxHeight = window.innerHeight * 0.75;
      setLibraryHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    };

    const onPointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isResizing]);

  // Pointer tracking for drag visual
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!draggingTrackId) return;
    const onMove = (e: PointerEvent) => setPointer({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [draggingTrackId]);

  // Lazy init on first user gesture
  const [started, setStarted] = useState(false);
  const ensureStarted = useCallback(async () => {
    const engine = getEngine();
    await engine.resume();
    if (!enginesRef.current) {
      enginesRef.current = {
        A: new DeckEngine(engine, engine.inA),
        B: new DeckEngine(engine, engine.inB),
      };
    }
    setStarted(true);
  }, []);

  // Wire master & crossfader to engine
  useEffect(() => {
    if (!started) return;
    getEngine().setCrossfader(crossfader);
  }, [crossfader, started]);
  useEffect(() => {
    if (!started) return;
    getEngine().setMaster(master);
  }, [master, started]);

  // Load track into deck
  const loadToDeck = useCallback(async (id: DeckId, trackId: string) => {
    await ensureStarted();
    const track = useStore.getState().tracks.find((t) => t.id === trackId);
    if (!track || !enginesRef.current) return;
    
    // Lazy-load buffer if not present
    let buffer = track.buffer;
    if (!buffer) {
      toast.loading(`Loading ${track.name}...`, { id: `load-${trackId}` });
      try {
        const engine = getEngine();
        const arr = await track.file.arrayBuffer();
        buffer = await engine.ctx.decodeAudioData(arr);
        const peaks = extractPeaks(buffer, 1500);
        const bpm = track.bpm || detectBPM(buffer);
        
        useStore.getState().updateTrack(track.id, {
          buffer,
          peaks,
          bpm,
          duration: buffer.duration
        });
        toast.success(`Loaded ${track.name}`, { id: `load-${trackId}` });
      } catch (err) {
        console.error(err);
        toast.error(`Failed to decode ${track.name}`, { id: `load-${trackId}` });
        return;
      }
    }

    const d = enginesRef.current[id];
    d.stop();
    d.loadBuffer(buffer);
    setDeck(id, { trackId, playing: false, position: 0, loopBeats: null, loopStart: null, cues: [null, null, null, null] });
  }, [ensureStarted, setDeck]);

  const onSync = useCallback(() => {
    const tA = tracks.find((t) => t.id === decksState.A.trackId);
    const tB = tracks.find((t) => t.id === decksState.B.trackId);
    if (!tA?.bpm || !tB?.bpm) {
      toast.error("Both decks need a track with detected BPM");
      return;
    }
    // Sync B to A
    const target = tA.bpm * (1 + decksState.A.pitch);
    const ratio = target / tB.bpm;
    const newPitch = Math.max(-0.08, Math.min(0.08, ratio - 1));
    setDeck("B", { pitch: newPitch });
    enginesRef.current?.B.setPitch(newPitch);
    toast.success(`B synced to ${target.toFixed(1)} BPM`);
  }, [tracks, decksState, setDeck]);

  // Recording
  const onToggleRecord = useCallback(async () => {
    await ensureStarted();
    const engine = getEngine();
    if (!recording) {
      engine.startRecording();
      setRecording(true);
      toast.success("Recording started");
    } else {
      const blob = await engine.stopRecording();
      setRecording(false);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.download = `dj-mix-${ts}.wav`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Recording saved");
      }
    }
  }, [recording, ensureStarted, setRecording]);

  // Keyboard shortcuts
  useKeyboard((e) => {
    const id = activeDeck;
    const eng = enginesRef.current?.[id];
    const d = useStore.getState().decks[id];
    if (e.code === "Space") {
      e.preventDefault();
      if (!eng?.hasBuffer()) return;
      if (eng.playing) { eng.pause(); setDeck(id, { playing: false }); }
      else { eng.play(); setDeck(id, { playing: true }); }
    } else if (e.code === "Tab") {
      e.preventDefault();
      useStore.getState().setActiveDeck(id === "A" ? "B" : "A");
    } else if (e.key === "Enter") {
      onSync();
    } else if (e.key === "c" || e.key === "C") {
      const t = eng?.currentTime() ?? 0;
      const cues = [...d.cues];
      const idx = cues.findIndex((c) => c === null);
      if (idx >= 0) { cues[idx] = t; setDeck(id, { cues }); toast.success(`Cue ${idx + 1} set`); }
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      const i = parseInt(e.key, 10) - 1;
      if (e.shiftKey) {
        const cues = [...d.cues];
        cues[i] = eng?.currentTime() ?? 0;
        setDeck(id, { cues });
      } else {
        const c = d.cues[i];
        if (c !== null && eng) {
          eng.seek(c);
          if (!eng.playing) { eng.play(c); setDeck(id, { playing: true }); }
        }
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const p = Math.min(0.08, d.pitch + (e.shiftKey ? 0.0005 : 0.005));
      setDeck(id, { pitch: p }); eng?.setPitch(p);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const p = Math.max(-0.08, d.pitch - (e.shiftKey ? 0.0005 : 0.005));
      setDeck(id, { pitch: p }); eng?.setPitch(p);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (!eng) return;
      const dt = e.shiftKey ? 0.05 : 1;
      eng.seek(eng.currentTime() + (e.key === "ArrowRight" ? dt : -dt));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onToggleRecord();
    }
  });

  // Pre-create engines on first interaction
  const onFirstInteract = () => { void ensureStarted(); };

  // HTML5 drag-and-drop handlers for deck drop zones
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (deckId: DeckId) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(null);
    const trackId = e.dataTransfer.getData("text/x-track-id");
    if (trackId) {
      void loadToDeck(deckId, trackId);
      toast.success(`Loaded to Deck ${deckId}`);
    }
  };

  // Touch drag: when user lifts finger over a deck while dragging
  const handleTouchDrop = (deckId: DeckId) => () => {
    if (draggingTrackId) {
      void loadToDeck(deckId, draggingTrackId);
      toast.success(`Loaded to Deck ${deckId}`);
      useStore.getState().setDraggingTrack(null);
      setDropHover(null);
    }
  };

  return (
    <div
      className={cn(
        "h-screen w-screen flex flex-col gap-4 p-3 md:p-6 overflow-hidden",
        isResizing && "cursor-ns-resize select-none"
      )}
      onPointerDown={onFirstInteract}
    >
      <Toaster theme="dark" position="top-center" richColors />

      <MasterBar
        recording={recording}
        onToggleRecord={onToggleRecord}
        onSync={onSync}
      />

      {/* Main mixer area */}
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        
        {/* Top Half: Decks & Faders */}
        <div className="flex-1 flex gap-4 min-h-[250px]">
          <SideVolume id="A" />

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-auto">
              {/* Deck A drop zone */}
              <div
                className={cn(
                  "min-h-0 rounded-lg transition-all",
                  (dropHover === "A" || (draggingTrackId && dropHover === "A")) && "ring-2 ring-[var(--deck-a)] ring-offset-2 ring-offset-background",
                  draggingTrackId && (dropHover as string) !== "A" && "opacity-80",
                )}
                onDragOver={handleDragOver}
                onDragEnter={() => setDropHover("A")}
                onDragLeave={() => setDropHover(null)}
                onDrop={handleDrop("A")}
                onPointerUp={handleTouchDrop("A")}
              >
                {enginesRef.current ? (
                  <Deck id="A" deck={enginesRef.current.A} positionRef={positionRefs.A} />
                ) : (
                  <DeckPlaceholder id="A" isDragTarget={dropHover === "A"} />
                )}
              </div>
              {/* Deck B drop zone */}
              <div
                className={cn(
                  "min-h-0 rounded-lg transition-all",
                  (dropHover === "B" || (draggingTrackId && dropHover === "B")) && "ring-2 ring-[var(--deck-b)] ring-offset-2 ring-offset-background",
                  draggingTrackId && (dropHover as string) !== "B" && "opacity-80",
                )}
                onDragOver={handleDragOver}
                onDragEnter={() => setDropHover("B")}
                onDragLeave={() => setDropHover(null)}
                onDrop={handleDrop("B")}
                onPointerUp={handleTouchDrop("B")}
              >
                {enginesRef.current ? (
                  <Deck id="B" deck={enginesRef.current.B} positionRef={positionRefs.B} />
                ) : (
                  <DeckPlaceholder id="B" isDragTarget={dropHover === "B"} />
                )}
              </div>
            </div>
            <Crossfader onChange={setCrossfader} />
          </div>

          <SideVolume id="B" />
        </div>

        {/* Bottom: Library (compact, scrollable, resizable) */}
        <div
          className={cn(
            "flex-none flex flex-col min-h-0 relative",
            !isResizing && "transition-[height] duration-300"
          )}
          style={{ height: isLibraryExpanded ? libraryHeight : 50 }}
        >
          {isLibraryExpanded && (
            <div
              className="absolute -top-1.5 left-0 right-0 h-3 cursor-ns-resize select-none flex items-center justify-center group z-50"
              onPointerDown={startResize}
              title="Drag to resize library"
            >
              <div className="w-20 h-1 rounded bg-border/80 group-hover:bg-primary/80 transition-colors" />
            </div>
          )}
          <div className={cn("h-full", isLibraryExpanded && "pt-1.5")}>
            <Library 
              isExpanded={isLibraryExpanded}
              onToggleExpand={() => setIsLibraryExpanded(!isLibraryExpanded)}
              onLoadToDeck={loadToDeck} 
            />
          </div>
        </div>
      </div>

      {/* Drag overlay hint */}
      {draggingTrackId && (
        <div 
          className="fixed pointer-events-none z-50 px-3 py-2 bg-background/90 backdrop-blur-md rounded-lg border border-primary text-foreground shadow-2xl transition-transform"
          style={{ left: pointer.x + 15, top: pointer.y + 15, transform: pointer.x === 0 ? "scale(0)" : "scale(1)" }}
        >
          <div className="flex items-center gap-2">
            <Music size={14} className="text-primary" />
            <div className="text-xs font-semibold truncate max-w-[200px]">
              {tracks.find(t => t.id === draggingTrackId)?.title || tracks.find(t => t.id === draggingTrackId)?.name || "Track"}
            </div>
          </div>
        </div>
      )}

      {!started && tracks.length === 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 panel px-4 py-2 text-xs text-muted-foreground font-display">
          Tap anywhere to enable audio · Drop tracks into the library to begin
        </div>
      )}
    </div>
  );
}

function DeckPlaceholder({ id, isDragTarget }: { id: DeckId; isDragTarget?: boolean }) {
  return (
    <div className={cn(
      "panel p-4 h-full flex items-center justify-center text-muted-foreground text-sm transition-all",
      isDragTarget && "border-primary bg-primary/5",
    )}>
      {isDragTarget ? `Drop to load Deck ${id}` : `Deck ${id} — tap to initialize`}
    </div>
  );
}

function SideVolume({ id }: { id: DeckId }) {
  const gain = useStore((s) => s.decks[id].gain);
  const setDeck = useStore((s) => s.setDeck);
  const color = id === "A" ? "var(--color-deck-a)" : "var(--color-deck-b)";
  return (
    <div
      className="panel flex flex-col items-center gap-2 py-3 px-2 w-16 shrink-0"
      style={{ borderColor: color }}
    >
      <div className="font-display text-[10px] tracking-widest text-muted-foreground">VOL</div>
      <div className="font-display text-[10px]" style={{ color }}>{id}</div>
      <Fader
        value={gain}
        onChange={(v) => setDeck(id, { gain: v })}
        orientation="vertical"
        resetValue={0.85}
        className="flex-1 w-full"
        trackClassName="!w-4 h-full"
        displayValue={`${Math.round(gain * 100)}`}
      />
    </div>
  );
}
