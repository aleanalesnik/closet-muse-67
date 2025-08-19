import React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // normalized [x1,y1,x2,y2] coordinates (0-1)
  paddingPct?: number;
  className?: string;
  alt?: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function toXYWH(b?: number[] | null): number[] | null {
  if (!b || b.length !== 4) return null;
  const arr = b.map(Number);
  if (!arr.every(Number.isFinite)) return null;

  // Convert from [x1,y1,x2,y2] to [x,y,w,h] format
  const [x1, y1, x2, y2] = arr;
  
  // Validate coordinates are normalized (0-1) and make sense
  const validCoords = [x1, y1, x2, y2].every(v => v >= 0 && v <= 1) && x2 > x1 && y2 > y1;
  if (!validCoords) return null;

  // Convert to [x,y,w,h] format
  const x = x1;
  const y = y1;
  const w = x2 - x1;
  const h = y2 - y1;
  
  // Ensure bbox doesn't exceed boundaries and has reasonable size
  if (w <= 0.01 || h <= 0.01) return null; // ignore tiny boxes
  
  return [x, y, w, h];
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(({ 
  src, 
  bbox, 
  paddingPct = 0.10, 
  className = "", 
  alt = "" 
}, ref) => {
  // Convert bbox to normalized [x,y,w,h] if available
  const xywh = toXYWH(bbox);
  
  if (!xywh) {
    // No valid bbox, show regular image
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
  }

  // Smart cropping: center on the detected item
  const [x, y, w, h] = xywh;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  
  const objectPositionX = (centerX * 100).toFixed(1);
  const objectPositionY = (centerY * 100).toFixed(1);
  
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
          objectPosition: `${objectPositionX}% ${objectPositionY}%`
        }}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;