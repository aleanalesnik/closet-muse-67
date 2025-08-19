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

  // The AI model returns normalized [x, y, w, h] coordinates (0-1)
  let [x, y, w, h] = arr;
  
  // Handle pixel coordinates if needed
  if (Math.max(...arr) > 1) {
    if (!iw || !ih) return null;
    x /= iw; y /= ih; w /= iw; h /= ih;
  }

  // Validate normalized coordinates
  const validCoords = [x, y, w, h].every(v => v >= 0 && v <= 1) && w > 0 && h > 0;
  if (!validCoords) return null;

  // Ensure bbox doesn't exceed image boundaries
  const clampedX = clamp01(x);
  const clampedY = clamp01(y);
  const clampedW = clamp01(Math.min(w, 1 - clampedX));
  const clampedH = clamp01(Math.min(h, 1 - clampedY));
  
  if (clampedW <= 0.01 || clampedH <= 0.01) return null; // ignore tiny boxes
  
  return [clampedX, clampedY, clampedW, clampedH];
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

  // Apply smart cropping with scale and translate
  const [x, y, w, h] = xywh;
  
  // Add padding to the detection area
  const paddedW = Math.min(1, w + (w * paddingPct * 2));
  const paddedH = Math.min(1, h + (h * paddingPct * 2));
  const paddedX = Math.max(0, x - (paddedW - w) / 2);
  const paddedY = Math.max(0, y - (paddedH - h) / 2);
  
  // Calculate scale factor to make the padded bbox fill the container
  // Use the smaller scale to ensure the entire area fits
  const scaleX = 1 / paddedW;
  const scaleY = 1 / paddedH;
  const scale = Math.min(scaleX, scaleY);
  
  // Calculate center points
  const bboxCenterX = paddedX + paddedW / 2;
  const bboxCenterY = paddedY + paddedH / 2;
  
  // Calculate translation to center the bbox in the container
  // After scaling, we need to translate so bbox center becomes container center (50%)
  const translateX = (0.5 - bboxCenterX) * scale * 100;
  const translateY = (0.5 - bboxCenterY) * scale * 100;
  
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
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
          transformOrigin: "center center"
        }}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;