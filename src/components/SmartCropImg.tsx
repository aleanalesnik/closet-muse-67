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
  
  // DEBUG: Log what we're getting
  console.log('[SmartCrop] Raw bbox:', bbox);
  console.log('[SmartCrop] Processed xywh:', xywh);
  
  if (!xywh) {
    // No valid bbox, show regular image
    console.log('[SmartCrop] No valid bbox, showing regular image');
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

  // Apply smart cropping with positioning and scaling
  const [x, y, w, h] = xywh;
  
  console.log('[SmartCrop] Applying smart crop with bbox:', { x, y, w, h });
  
  // Add padding to the detection area
  const padding = paddingPct;
  const paddedX = Math.max(0, x - w * padding);
  const paddedY = Math.max(0, y - h * padding);
  const paddedW = Math.min(1 - paddedX, w * (1 + padding * 2));
  const paddedH = Math.min(1 - paddedY, h * (1 + padding * 2));
  
  // Calculate scale to zoom into the padded region
  const scaleX = 1 / paddedW;
  const scaleY = 1 / paddedH;
  const scale = Math.max(scaleX, scaleY); // Use max to ensure full coverage
  
  // Calculate position to center the cropped area
  const translateX = -paddedX * 100;
  const translateY = -paddedY * 100;
  
  console.log('[SmartCrop] Transform values:', { 
    scale: scale.toFixed(2), 
    translateX: translateX.toFixed(2), 
    translateY: translateY.toFixed(2),
    paddedW: paddedW.toFixed(3),
    paddedH: paddedH.toFixed(3)
  });
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        ref={ref}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          width: `${scale * 100}%`,
          height: `${scale * 100}%`,
          position: 'absolute',
          left: `${translateX}%`,
          top: `${translateY}%`,
          objectFit: 'cover'
        }}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;