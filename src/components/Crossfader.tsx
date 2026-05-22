import { Fader } from "./Fader";
import { useStore } from "@/lib/store";

interface Props {
  onChange: (v: number) => void;
}

export function Crossfader({ onChange }: Props) {
  const value = useStore((s) => s.crossfader);
  return (
    <div className="panel p-3 md:p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-display">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "var(--deck-a)",
              boxShadow: value < -0.3 ? "0 0 8px var(--deck-a)" : "none",
              opacity: value < 0 ? 1 : 0.4,
              transition: "all 0.2s",
            }}
          />
          <span style={{ color: "var(--color-deck-a)" }}>A</span>
        </div>
        <span className="text-muted-foreground">CROSSFADER</span>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "var(--color-deck-b)" }}>B</span>
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "var(--deck-b)",
              boxShadow: value > 0.3 ? "0 0 8px var(--deck-b)" : "none",
              opacity: value > 0 ? 1 : 0.4,
              transition: "all 0.2s",
            }}
          />
        </div>
      </div>
      <div className="px-2 py-3">
        <Fader
          value={(value + 1) / 2}
          onChange={(v) => onChange(v * 2 - 1)}
          orientation="horizontal"
          resetValue={0.5}
          trackClassName="!h-4 min-w-full"
          handleClassName="!w-10 !h-10"
        />
      </div>
    </div>
  );
}
