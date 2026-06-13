import { useDropzone } from "react-dropzone";
import { Upload, Folder, Music, Trash2, ArrowUpDown, Search, Disc3, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { useStore, type DeckId, type Track } from "@/lib/store";
import { getEngine } from "@/lib/audio/engine";
import { extractPeaks } from "@/lib/audio/waveform";
import { detectBPM } from "@/lib/audio/bpm";
import { toast } from "sonner";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  isExpanded: boolean;
  onToggleExpand: () => void;
  onLoadToDeck: (deck: DeckId, trackId: string) => void;
}

type SortKey = "added" | "title" | "bpm" | "duration";
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;

async function readMetadata(file: File): Promise<{ title: string | null; artist: string | null; album: string | null; duration: number }> {
  try {
    const mm = await import("music-metadata");
    const meta = await mm.parseBlob(file, { duration: true, skipCovers: true });
    return {
      title: meta.common.title?.trim() || null,
      artist: meta.common.artist?.trim() || meta.common.artists?.join(", ") || null,
      album: meta.common.album?.trim() || null,
      duration: meta.format.duration || 0,
    };
  } catch {
    return { title: null, artist: null, album: null, duration: 0 };
  }
}

export function Library({ isExpanded, onToggleExpand, onLoadToDeck }: Props) {
  const tracks = useStore((s) => s.tracks);
  const addTrack = useStore((s) => s.addTrack);
  const removeTrack = useStore((s) => s.removeTrack);
  const deckA = useStore((s) => s.decks.A.trackId);
  const deckB = useStore((s) => s.decks.B.trackId);
  const setDraggingTrack = useStore((s) => s.setDraggingTrack);
  const draggingTrackId = useStore((s) => s.draggingTrackId);
  const [loading, setLoading] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    try {
      const meta = await readMetadata(file);
      const filename = file.name.replace(/\.[^.]+$/, "");
      const track: Track = {
        id: crypto.randomUUID(),
        name: meta.title || filename,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration: meta.duration,
        bpm: null,
        file,
      };
      addTrack(track);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to process ${file.name}`);
    }
  };

  const processMany = async (files: File[]) => {
    const audio = files.filter((f) => AUDIO_RE.test(f.name));
    if (audio.length === 0) {
      toast.error("No audio files found");
      return;
    }
    setLoading((n) => n + audio.length);
    let ok = 0;
    
    // Process in parallel chunks to dramatically speed up loading
    const chunkSize = 10;
    for (let i = 0; i < audio.length; i += chunkSize) {
      const chunk = audio.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (f) => {
          await processFile(f);
          ok++;
          setLoading((n) => n - 1);
        })
      );
    }
    
    toast.success(`Added ${ok} track${ok === 1 ? "" : "s"}`);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "audio/*": [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"],
    },
    noClick: true,
    onDrop: (files) => void processMany(files),
  });

  // --- Drag state refs (Playlist Maker pattern) ---
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTrackId = useRef<string | null>(null);
  const holdStartXY = useRef({ x: 0, y: 0 });
  const HOLD_DELAY = 350; // ms before drag activates (matches Playlist Maker)
  const HOLD_CANCEL_PX = 20; // movement threshold to cancel hold

  // Cancel any pending hold
  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    holdTrackId.current = null;
  }, []);

  // Fire the drag (called after hold delay OR immediately on right-click)
  const fireDrag = useCallback((trackId: string) => {
    cancelHold();
    setDraggingTrack(trackId);
    if (navigator.vibrate) navigator.vibrate(30);
  }, [cancelHold, setDraggingTrack]);

  // Grip handle: pointer down
  const onGripPointerDown = useCallback((trackId: string, e: React.PointerEvent) => {
    e.stopPropagation(); // Don't trigger pan-scroll on the row
    if (e.button === 2) {
      // Right-click: instant drag (matches _on_touch_gesture)
      e.preventDefault();
      fireDrag(trackId);
      return;
    }
    // Left-click or touch: start 350ms hold timer
    holdTrackId.current = trackId;
    holdStartXY.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = setTimeout(() => fireDrag(trackId), HOLD_DELAY);
  }, [fireDrag]);

  // Grip handle: pointer move — cancel if moved >20px (treat as scroll attempt)
  const onGripPointerMove = useCallback((e: React.PointerEvent) => {
    if (!holdTimer.current) return;
    const dx = Math.abs(e.clientX - holdStartXY.current.x);
    const dy = Math.abs(e.clientY - holdStartXY.current.y);
    if (dx > HOLD_CANCEL_PX || dy > HOLD_CANCEL_PX) {
      cancelHold();
    }
  }, [cancelHold]);

  // Grip handle: pointer up/cancel/leave
  const onGripPointerUp = useCallback(() => {
    cancelHold();
  }, [cancelHold]);

  // HTML5 drag events (for when drag IS active and user drags to a deck)
  const handleDragStart = useCallback((trackId: string, e: React.DragEvent) => {
    e.dataTransfer.setData("text/x-track-id", trackId);
    e.dataTransfer.effectAllowed = "copy";
    setDraggingTrack(trackId);
  }, [setDraggingTrack]);

  const handleDragEnd = useCallback(() => {
    setDraggingTrack(null);
  }, [setDraggingTrack]);

  // --- Mouse-pan scrolling (click-drag on row body scrolls the list) ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ y: 0, scrollTop: 0 });

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: PointerEvent) => {
      if (!scrollRef.current) return;
      const dy = e.clientY - panStart.current.y;
      scrollRef.current.scrollTop = panStart.current.scrollTop - dy;
    };
    const onUp = () => setIsPanning(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isPanning]);

  const onPanDown = useCallback((e: React.PointerEvent) => {
    // Only left-click mouse triggers pan-scroll
    if (e.button !== 0) return;
    // Don't pan if clicking buttons, inputs, or the drag handle
    const target = e.target as HTMLElement;
    if (target.closest("button, input, .drag-handle")) return;
    setIsPanning(true);
    panStart.current = { y: e.clientY, scrollTop: scrollRef.current?.scrollTop || 0 };
  }, []);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase().trim();
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.title && t.title.toLowerCase().includes(q)),
    );
  }, [tracks, searchQuery]);

  const sorted = useMemo(() => {
    const titleKey = (s: string) => s.toLowerCase().trim();

    if (sortKey === "added") {
      return sortDir === "asc" ? [...filtered] : [...filtered].reverse();
    }

    const arr = [...filtered];
    const mul = sortDir === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      if (sortKey === "title") {
        const at = titleKey(a.name);
        const bt = titleKey(b.name);
        return at.localeCompare(bt, undefined, { sensitivity: "base" }) * mul;
      }
      if (sortKey === "bpm") {
        if (a.bpm === null && b.bpm === null) return 0;
        if (a.bpm === null) return 1;
        if (b.bpm === null) return -1;
        return (a.bpm - b.bpm) * mul;
      }
      return (a.duration - b.duration) * mul;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const sortLabel: Record<SortKey, string> = {
    added: "ADDED",
    title: "TITLE",
    bpm: "BPM",
    duration: "TIME",
  };

  const getDeckLabel = (trackId: string): string | null => {
    if (trackId === deckA && trackId === deckB) return "A+B";
    if (trackId === deckA) return "A";
    if (trackId === deckB) return "B";
    return null;
  };

  return (
    <div
      {...getRootProps()}
      className={cn(
        "panel p-3 flex flex-col gap-2 h-full",
        isDragActive && "border-primary deck-a-glow",
      )}
    >
      <input {...getInputProps()} />
      <input
        type="file"
        ref={folderInputRef}
        style={{ display: "none" }}
        {...({
          webkitdirectory: "",
          directory: "",
          multiple: true,
        } as any)}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            void processMany(files);
          }
          e.target.value = "";
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <button 
          onClick={onToggleExpand} 
          className="flex items-center gap-2 font-display text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
        >
          <div className="w-6 h-6 rounded flex items-center justify-center bg-secondary/50 group-hover:bg-secondary">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
          LIBRARY {tracks.length > 0 && <span className="text-foreground">({tracks.length})</span>}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={open}
            className="h-10 px-3 rounded-md bg-card border border-border hover:bg-secondary font-display text-xs flex items-center gap-1.5 active:scale-95 transition-all"
            title="Select audio files"
          >
            <Upload size={16} /> ADD FILES
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="h-10 px-3 rounded-md bg-card border border-border hover:bg-secondary font-display text-xs flex items-center gap-1.5 active:scale-95 transition-all"
            title="Select folder with audio files"
          >
            <Folder size={16} /> ADD FOLDER
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Search */}
      {tracks.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search tracks…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-md bg-input border border-border text-sm font-display placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            style={{ userSelect: "text" }}
          />
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {(["title", "bpm", "duration", "added"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => cycleSort(k)}
            className={cn(
              "h-10 px-2 rounded-md border font-display text-[10px] tracking-widest flex items-center gap-1 active:scale-95 flex-1 justify-center min-w-0 transition-all",
              sortKey === k
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border bg-card hover:bg-secondary text-muted-foreground",
            )}
            aria-label={`Sort by ${sortLabel[k]}`}
          >
            {sortLabel[k]}
            {sortKey === k && (
              <ArrowUpDown size={10} className={cn("transition-transform", sortDir === "desc" && "rotate-180")} />
            )}
          </button>
        ))}
      </div>

      <div 
        ref={scrollRef}
        onPointerDown={onPanDown}
        className={cn(
          "flex-1 min-h-32 overflow-y-auto w-full",
          isPanning && "cursor-grabbing select-none"
        )}
        style={{ touchAction: "pan-y" }}
      >
        {tracks.length === 0 ? (
          <div className="h-full min-h-32 flex flex-col items-center justify-center text-center text-muted-foreground gap-3 p-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Music size={28} className="text-primary/60" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground/70">No tracks loaded</div>
              <div className="text-xs mt-1">
                Drag and drop audio folders/files here<br />
                <span className="text-primary/60">or tap ADD FILES</span>
              </div>
            </div>
            {loading > 0 && <div className="text-xs text-primary font-display">Loading {loading}…</div>}
          </div>
        ) : (
          <>
            {loading > 0 && (
              <div className="text-xs text-primary px-2 pb-2 font-display">Loading {loading}…</div>
            )}
            {sorted.length === 0 && searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-8">
                <Search size={20} />
                <div className="text-xs font-display">No tracks match "{searchQuery}"</div>
              </div>
            )}
            <div className="flex flex-col">
              {/* Table Header */}
              <div className="flex items-center gap-2 md:gap-4 px-3 py-2 text-[10px] font-display text-muted-foreground uppercase tracking-widest border-b">
                <div className="w-[30px] shrink-0"></div>
                <div className="flex-1">Track</div>
                <div className="hidden lg:block w-[150px]">Album</div>
                <div className="hidden md:block w-[60px] text-right">BPM</div>
                <div className="hidden md:block w-[60px] text-right">Time</div>
                <div className="w-[90px] md:w-[120px] shrink-0"></div>
              </div>

              {/* Rows */}
              <div className="flex flex-col space-y-1 mt-2">
                {sorted.map((t) => {
                  const deckLabel = getDeckLabel(t.id);
                  const isDragging = draggingTrackId === t.id;
                  return (
                    <div
                      key={t.id}
                      onContextMenu={(e) => e.preventDefault()}
                      className={cn(
                        "track-row group flex items-center gap-2 md:gap-4 p-2 h-14 md:h-12 rounded-md border touch-manipulation cursor-pointer",
                        isDragging && "opacity-50 scale-[0.98] ring-2 ring-primary",
                        deckLabel
                          ? "bg-card/80 border-l-[3px]"
                          : "bg-card/30 border-transparent",
                      )}
                      style={
                        deckLabel
                          ? {
                              borderLeftColor:
                                deckLabel === "A"
                                  ? "var(--deck-a)"
                                  : deckLabel === "B"
                                    ? "var(--deck-b)"
                                    : "var(--primary)",
                            }
                          : undefined
                      }
                    >
                      <div 
                        className="drag-handle flex justify-center w-[30px] shrink-0 h-full items-center touch-none cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => onGripPointerDown(t.id, e)}
                        onPointerMove={onGripPointerMove}
                        onPointerUp={onGripPointerUp}
                        onPointerCancel={onGripPointerUp}
                        onPointerLeave={onGripPointerUp}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {deckLabel ? (
                          <Disc3 size={16} className="shrink-0 spin-disc" style={{ color: deckLabel === "B" ? "var(--deck-b)" : "var(--deck-a)" }} />
                        ) : (
                          <div className="p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <GripVertical size={14} className="text-muted-foreground/60 shrink-0" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="truncate text-[14px] font-semibold tracking-tight">
                          {t.title || t.name}
                          {deckLabel && (
                            <span
                              className="ml-2 text-[9px] font-display px-1.5 py-0.5 rounded-sm tracking-widest inline-block -translate-y-[1px]"
                              style={{
                                background:
                                  deckLabel === "B"
                                    ? "var(--deck-b-glow)"
                                    : "var(--deck-a-glow)",
                                color: "var(--foreground)",
                              }}
                            >
                              DECK {deckLabel}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[12px] text-muted-foreground flex items-center gap-2">
                          <span>{t.artist || "Unknown Artist"}</span>
                          <span className="md:hidden opacity-50">• {t.bpm ? t.bpm.toFixed(1) : '-'} BPM</span>
                        </div>
                      </div>

                      <div className="hidden lg:block w-[150px] truncate text-[12px] text-muted-foreground/70">
                        {t.album || <span className="opacity-50">—</span>}
                      </div>

                      <div className="hidden md:block w-[60px] text-[12px] font-display text-muted-foreground text-right tabular-nums">
                        {t.bpm ? t.bpm.toFixed(1) : <span className="opacity-50">—</span>}
                      </div>

                      <div className="hidden md:block w-[60px] text-[12px] font-display text-muted-foreground text-right tabular-nums">
                        {fmtTime(t.duration)}
                      </div>

                      <div className="w-[90px] md:w-[120px] shrink-0 flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onLoadToDeck("A", t.id)}
                          className={cn(
                            "h-7 px-2 rounded text-[10px] font-display border transition-all active:scale-95",
                            deckA === t.id
                              ? "bg-[var(--deck-a-glow)] border-[var(--deck-a)] text-foreground"
                              : "border-border hover:bg-secondary hover:border-[var(--deck-a)]/50",
                          )}
                          style={{ color: deckA !== t.id ? "var(--deck-a)" : undefined }}
                        >
                          → A
                        </button>
                        <button
                          onClick={() => onLoadToDeck("B", t.id)}
                          className={cn(
                            "h-7 px-2 rounded text-[10px] font-display border transition-all active:scale-95",
                            deckB === t.id
                              ? "bg-[var(--deck-b-glow)] border-[var(--deck-b)] text-foreground"
                              : "border-border hover:bg-secondary hover:border-[var(--deck-b)]/50",
                          )}
                          style={{ color: deckB !== t.id ? "var(--deck-b)" : undefined }}
                        >
                          → B
                        </button>
                        <button
                          onClick={() => removeTrack(t.id)}
                          className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-all"
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
      </>
      )}
    </div>
  );
}
