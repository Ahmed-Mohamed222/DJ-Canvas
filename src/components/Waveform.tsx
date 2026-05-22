import { useEffect, useRef } from "react";
import type { Track } from "@/lib/store";

interface Props {
  track: Track | null;
  positionRef: React.MutableRefObject<number>; // seconds
  color: string;
  glow: string;
  onSeek: (t: number) => void;
  cues: (number | null)[];
  loopStart: number | null;
  loopEnd: number | null;
}

export function Waveform({ track, positionRef, color, glow, onSeek, cues, loopStart, loopEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Resize observer
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(wrap.clientWidth * dpr);
      canvas.height = Math.floor(wrap.clientHeight * dpr);
      canvas.style.width = wrap.clientWidth + "px";
      canvas.style.height = wrap.clientHeight + "px";
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Draw loop with rAF, throttled to ~30fps for low-end devices
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 30;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.02)";
      ctx.fillRect(0, 0, w, h);

      if (track && track.peaks) {
        const peaks = track.peaks;
        const mid = h / 2;
        const pos = positionRef.current;
        const px = (pos / track.duration) * w;

        // Step every 2px on wide canvases to halve draw cost
        const step = w > 600 ? 2 : 1;
        const samplesPerPx = peaks.length / w;

        // Draw played region (dimmed)
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        for (let x = 0; x < Math.min(px, w); x += step) {
          let max = 0;
          const s = Math.floor(x * samplesPerPx);
          const e = Math.floor((x + step) * samplesPerPx);
          for (let i = s; i < e; i++) {
            const v = peaks[i];
            if (v > max) max = v;
          }
          const amp = max * (h * 0.45);
          ctx.moveTo(x + 0.5, mid - amp);
          ctx.lineTo(x + 0.5, mid + amp);
        }
        ctx.stroke();

        // Draw upcoming region (bright)
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (let x = Math.max(0, Math.floor(px)); x < w; x += step) {
          let max = 0;
          const s = Math.floor(x * samplesPerPx);
          const e = Math.floor((x + step) * samplesPerPx);
          for (let i = s; i < e; i++) {
            const v = peaks[i];
            if (v > max) max = v;
          }
          const amp = max * (h * 0.45);
          ctx.moveTo(x + 0.5, mid - amp);
          ctx.lineTo(x + 0.5, mid + amp);
        }
        ctx.stroke();

        // Loop region overlay
        if (loopStart !== null && loopEnd !== null && track.duration > 0) {
          const xs = (loopStart / track.duration) * w;
          const xe = (loopEnd / track.duration) * w;
          ctx.fillStyle = color + "33";
          ctx.fillRect(xs, 0, xe - xs, h);
        }

        // Cue markers
        for (let i = 0; i < cues.length; i++) {
          const c = cues[i];
          if (c === null) continue;
          const x = (c / track.duration) * w;
          ctx.fillStyle = "rgba(255, 220, 60, 0.9)";
          ctx.fillRect(x - 1 * dpr, 0, 2 * dpr, h);
          ctx.fillStyle = "rgba(255, 220, 60, 1)";
          ctx.font = `${10 * dpr}px monospace`;
          ctx.fillText(String(i + 1), x + 3 * dpr, 12 * dpr);
        }

        // Playhead
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();

        // Playhead glow
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 8 * dpr;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = `${14 * dpr}px ui-sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Drop a track here", w / 2, h / 2);
        ctx.textAlign = "start";
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track, color, glow, cues, loopStart, loopEnd, positionRef]);

  // Click/touch to scrub
  const onPointer = (e: React.PointerEvent) => {
    if (!track) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, x)) * track.duration);
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-32 md:h-40 rounded-md bg-input/40 border border-border overflow-hidden scrub-area"
      onPointerDown={onPointer}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
