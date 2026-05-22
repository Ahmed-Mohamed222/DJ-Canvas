import { Disc3, Mic, Square, Link2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Knob } from "./Knob";
import { cn } from "@/lib/utils";

interface Props {
  recording: boolean;
  onToggleRecord: () => void;
  onSync: () => void;
}

export function MasterBar({ recording, onToggleRecord, onSync }: Props) {
  const master = useStore((s) => s.masterGain);
  const setMaster = useStore((s) => s.setMaster);
  const tracks = useStore((s) => s.tracks);
  const decks = useStore((s) => s.decks);
  const activeDeck = useStore((s) => s.activeDeck);
  const aTrack = tracks.find((t) => t.id === decks.A.trackId);
  const bTrack = tracks.find((t) => t.id === decks.B.trackId);
  const aBpm = aTrack?.bpm ? aTrack.bpm * (1 + decks.A.pitch) : null;
  const bBpm = bTrack?.bpm ? bTrack.bpm * (1 + decks.B.pitch) : null;
  const synced =
    aBpm !== null && bBpm !== null && Math.abs(aBpm - bBpm) < 0.1;

  return (
    <div className="panel px-3 md:px-4 py-2 flex items-center gap-3 md:gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <Disc3 className="text-primary" size={22} />
        <div>
          <div className="font-display text-sm tracking-widest leading-none">
            DJ <span className="text-primary">CANVAS</span>
          </div>
          <div className="text-[9px] text-muted-foreground font-display tracking-widest mt-1 uppercase">
            BY <a href="https://github.com/Ahmed-Mohamed222" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary transition-colors cursor-pointer">Ahmed Mohamed</a>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Active deck indicator */}
        <div className="flex items-center gap-1.5 font-display text-[10px] tracking-widest">
          <span
            className={cn(
              "px-2 py-1 rounded-md border transition-all",
              activeDeck === "A"
                ? "border-[var(--deck-a)] bg-[var(--deck-a-glow)] text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            A
          </span>
          <span
            className={cn(
              "px-2 py-1 rounded-md border transition-all",
              activeDeck === "B"
                ? "border-[var(--deck-b)] bg-[var(--deck-b-glow)] text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            B
          </span>
        </div>

        <div className="font-display text-xs flex items-center gap-2">
          <span style={{ color: "var(--color-deck-a)" }}>A</span>
          <span className="tabular-nums">{aBpm ? aBpm.toFixed(1) : "—"}</span>
          <span className="text-muted-foreground">|</span>
          <span style={{ color: "var(--color-deck-b)" }}>B</span>
          <span className="tabular-nums">{bBpm ? bBpm.toFixed(1) : "—"}</span>
          {synced && <span className="text-primary text-[10px] ml-1">●SYNC</span>}
        </div>
        <button
          onClick={onSync}
          className={cn(
            "h-10 px-3 rounded-md border font-display text-xs flex items-center gap-1.5 active:scale-95 transition-all",
            synced
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-card border-border hover:bg-secondary",
          )}
        >
          <Link2 size={14} /> SYNC
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-border">
          <Knob
            value={master}
            min={0}
            max={1}
            onChange={setMaster}
            label="MASTER"
            color="var(--color-primary)"
            size={44}
            resetValue={0.85}
            displayValue={`${Math.round(master * 100)}`}
          />
        </div>

        <button
          onClick={onToggleRecord}
          className={
            "h-10 px-4 rounded-md border font-display text-xs flex items-center gap-2 active:scale-95 transition-all " +
            (recording
              ? "bg-destructive/20 border-destructive text-destructive animate-pulse"
              : "bg-card border-border hover:bg-secondary")
          }
        >
          {recording ? <Square size={14} /> : <Mic size={14} />}
          {recording ? "STOP" : "REC"}
        </button>
      </div>
    </div>
  );
}
