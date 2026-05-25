import { useEffect, useRef } from "react";
import { usePointerDrag } from "@/lib/input/use-pointer-drag";
import { cn } from "@/lib/utils";

interface FaderProps {
  value: number;       // 0..1
  onChange: (v: number) => void;
  orientation?: "vertical" | "horizontal";
  className?: string;
  trackClassName?: string;
  handleClassName?: string;
  label?: string;
  displayValue?: string;
  /** Reset value on double-click / two-finger tap */
  resetValue?: number;
  /** Wheel scroll step (e.g. 0.01) */
  wheelStep?: number;
}

export function Fader({
  value,
  onChange,
  orientation = "vertical",
  className,
  trackClassName,
  handleClassName,
  label,
  displayValue,
  resetValue,
  wheelStep = 0.01,
}: FaderProps) {
  const dragRef = usePointerDrag<HTMLDivElement>({
    orientation,
    onChange: (v) => onChange(v),
  });

  const lastTapRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleClick = () => {
    if (resetValue === undefined) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) onChange(resetValue);
    lastTapRef.current = now;
  };

  // Attach non-passive wheel listener so preventDefault works
  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      const step = e.shiftKey ? wheelStep / 10 : wheelStep;
      onChangeRef.current(Math.max(0, Math.min(1, valueRef.current + dir * step)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [dragRef, wheelStep]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (resetValue === undefined) return;
    e.preventDefault();
    onChange(resetValue);
  };

  const pct = value * 100;
  const handleStyle =
    orientation === "vertical"
      ? { bottom: `calc(${pct}% - 14px)` }
      : { left: `calc(${pct}% - 14px)` };

  return (
    <div className={cn("flex flex-col items-center gap-1 select-none", className)}>
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">
          {label}
        </div>
      )}
      <div
        ref={dragRef}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => resetValue !== undefined && onChange(resetValue)}
        onPointerDown={handleClick}
        className={cn(
          "control-track relative rounded-full bg-input border border-border overflow-visible",
          orientation === "vertical" ? "w-2.5 h-full min-h-32" : "h-2.5 w-full min-w-32",
          trackClassName,
        )}
        style={{ touchAction: "none" }}
      >
        {/* fill */}
        <div
          className="absolute bg-primary/30 rounded-full"
          style={
            orientation === "vertical"
              ? { left: 0, right: 0, bottom: 0, height: `${pct}%` }
              : { top: 0, bottom: 0, left: 0, width: `${pct}%` }
          }
        />
        {/* handle */}
        <div
          className={cn(
            "absolute rounded-md bg-foreground shadow-lg border border-border",
            "transition-transform active:scale-110",
            orientation === "vertical" ? "w-7 h-7 -left-2.5" : "h-7 w-7 -top-2.5",
            handleClassName,
          )}
          style={handleStyle}
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
