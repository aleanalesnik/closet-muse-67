import React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // may be [x,y,w,h] or [x1,y1,x2,y2], pixels or normalized
  paddingPct?: number;
  className?: string;
  alt?: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function toXYWH(b?: number[] | null, iw?: number, ih?: number): number[] | null {
  if (!b || b.length !== 4) return null;
  const arr = b.map(Number);
  if (!arr.every(Number.isFinite)) return null;

  let [x1, y1, x2, y2] = arr;
  const max = Math.max(...arr);

  if (max > 1) {
    // Handle either percentage 0-100 or pixel space
    if (max <= 100) {
      // percentages
      x1 /= 100; y1 /= 100; x2 /= 100; y2 /= 100;
    } else {
      if (!iw || !ih) return null;
      x1 /= iw; y1 /= ih; x2 /= iw; y2 /= ih;
    }
  }

  // At this point values are normalized 0-1
  const in01 = [x1, y1, x2, y2].every(v => v >= 0 && v <= 1);
  if (!in01) return null;

  // Prefer interpreting as [x1,y1,x2,y2]
  if (x2 > x1 && y2 > y1) {
    const w = clamp01(x2 - x1);
    const h = clamp01(y2 - y1);
    if (w > 0 && h > 0) return [clamp01(x1), clamp01(y1), w, h];
  }

  // Fallback: treat as [x,y,w,h]
  const w = clamp01(Math.min(x2, 1 - x1));
  const h = clamp01(Math.min(y2, 1 - y1));
  if (w > 0 && h > 0) return [clamp01(x1), clamp01(y1), w, h];

  return null;
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(({ 
  src, 
  bbox, 
  paddingPct = 0.10, 
  className = "", 
  alt = "" 
}, ref) => {
  // For now, just show regular image - much faster!
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        ref={ref}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center"
        }}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;