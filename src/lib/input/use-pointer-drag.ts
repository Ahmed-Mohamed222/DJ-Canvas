import { useEffect, useRef } from "react";

interface DragOptions {
  /** Called with normalized value 0..1 (top=1 by default for vertical, left=0 for horizontal) */
  onChange: (value: number, e: PointerEvent) => void;
  onStart?: (e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
  orientation?: "vertical" | "horizontal";
  /** Invert vertical so up = 1 (default true) */
  invertVertical?: boolean;
}

/**
 * Universal pointer-drag hook. Works for mouse, touch, and pen.
 * Returns ref to attach to the draggable element.
 */
export function usePointerDrag<T extends HTMLElement>(opts: DragOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const elRef = useRef<T | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let active = false;
    let pointerId = -1;

    const compute = (e: PointerEvent) => {
      const o = optsRef.current;
      const rect = el.getBoundingClientRect();
      if (o.orientation === "horizontal") {
        const v = (e.clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(1, v));
      }
      let v = (e.clientY - rect.top) / rect.height;
      if (o.invertVertical !== false) v = 1 - v;
      return Math.max(0, Math.min(1, v));
    };

    const onDown = (e: PointerEvent) => {
      active = true;
      pointerId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch {}
      el.classList.add("dragging");
      optsRef.current.onStart?.(e);
      optsRef.current.onChange(compute(e), e);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return;
      optsRef.current.onChange(compute(e), e);
    };
    const onUp = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      try { el.releasePointerCapture(e.pointerId); } catch {}
      el.classList.remove("dragging");
      optsRef.current.onEnd?.(e);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return elRef;
}
