import { useEffect, useRef } from "react";
import { usePointerDrag } from "@/lib/input/use-pointer-drag";
import { cn } from "@/lib/utils";

interface KnobProps {
  value: number;            // -1..1 or 0..1 (see range)
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  size?: number;
  label?: string;
  color?: string;
  resetValue?: number;
  displayValue?: string;
  wheelStep?: number;
}

export function Knob({
  value,
  min = -1,
  max = 1,
  onChange,
  size = 56,
  label,
  color = "var(--color-primary)",
  resetValue,
  displayValue,
  wheelStep = 0.02,
}: KnobProps) {
  const startRef = useRef({ y: 0, v: 0 });
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ref = usePointerDrag<HTMLDivElement>({
    onChange: () => { /* unused — we use custom delta */ },
    onStart: (e) => {
      startRef.current = { y: e.clientY, v: value };
    },
  });

  // Override pointermove logic with delta-based input
  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    const dy = startRef.current.y - e.clientY;
    const range = max - min;
    const sensitivity = e.shiftKey ? range / 800 : range / 200;
    const v = Math.max(min, Math.min(max, startRef.current.v + dy * sensitivity));
    onChange(v);
  };

  // Attach non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      const step = e.shiftKey ? wheelStep / 5 : wheelStep;
      const v = valueRef.current;
      onChangeRef.current(Math.max(min, Math.min(max, v + dir * step * (max - min))));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref, wheelStep, min, max]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (resetValue === undefined) return;
    e.preventDefault();
    onChange(resetValue);
  };

  const norm = (value - min) / (max - min); // 0..1
  const angle = -135 + norm * 270; // -135..+135

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">
          {label}
        </div>
      )}
      <div
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerDown={(e) => { startRef.current = { y: e.clientY, v: value }; }}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => resetValue !== undefined && onChange(resetValue)}
        className="relative rounded-full bg-input border border-border control-track shadow-inner"
        style={{ width: size, height: size, touchAction: "none" }}
      >
        {/* tick */}
        <div
          className="absolute left-1/2 top-1.5 w-0.5 h-1/2 origin-bottom"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)`, background: color, boxShadow: `0 0 6px ${color}` }}
        />
        {/* center cap */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card border border-border"
          style={{ width: size * 0.35, height: size * 0.35 }}
        />
      </div>
      {displayValue !== undefined && (
        <div className="text-[10px] font-display text-muted-foreground tabular-nums">
          {displayValue}
        </div>
      )}
    </div>
  );
}
