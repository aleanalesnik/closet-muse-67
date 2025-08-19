import React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // normalized [x, y, w, h]
  paddingPct?: number;
  className?: string;
  alt?: string;
};

function toXYWH(b?: number[] | null): number[] | null {
  if (!b || b.length !== 4) return null;
  const arr = b.map(Number);
  if (!arr.every(Number.isFinite)) return null;

  const [x1, y1, x2, y2] = arr;
  const in01 = arr.every(v => v >= 0 && v <= 1);

  if (in01) {
    // If the values look like [x, y, w, h] and fit within the unit square
    if (x1 + x2 <= 1 && y1 + y2 <= 1) {
      if (x2 > 0 && y2 > 0) return [x1, y1, x2, y2];
      return null;
    }

    // Otherwise treat as [x1, y1, x2, y2]
    if (x2 > x1 && y2 > y1) {
      const w = x2 - x1;
      const h = y2 - y1;
      if (w > 0 && h > 0) return [x1, y1, w, h];
    }
  }

  // Anything else (pixels or malformed) -> ignore to prevent snap
  return null;
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(({ 
  src, 
  bbox, 
  paddingPct = 0.10, 
  className = "", 
  alt = "" 
}, ref) => {
  // Create a local ref for internal use
  const localImgRef = React.useRef<HTMLImageElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({ 
    width: "100%", 
    height: "100%", 
    objectFit: "contain", 
    objectPosition: "center" 
  });
  
  React.useLayoutEffect(() => {
    const img = localImgRef.current;
    if (!img) return;

    function apply() {
      const container = img.parentElement!;
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;

      // Don't process if image dimensions aren't ready yet
      if (iw === 0 || ih === 0) {
        return;
      }

      const safe = toXYWH(bbox as any);
      if (!safe) {
        // Fallback: non-distorting contain
        setStyle({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
        });
        return;
      }

      const [x, y, w, h] = safe;
      
      // Calculate scale to fit the bbox with padding in the container
      const pad = 1 + paddingPct; // e.g., 1.10 for 10% slack
      const bboxPixelW = w * iw;
      const bboxPixelH = h * ih;
      const scale = Math.min(cw / (bboxPixelW * pad), ch / (bboxPixelH * pad));

      // Scale the entire image
      const scaledImageWidth = iw * scale;
      const scaledImageHeight = ih * scale;
      
      // Calculate where the bbox center should be (center of container)
      const targetBboxCenterX = cw / 2;
      const targetBboxCenterY = ch / 2;
      
      // Calculate where the bbox center currently is in the scaled image
      const currentBboxCenterX = (x + w/2) * iw * scale;
      const currentBboxCenterY = (y + h/2) * ih * scale;
      
      // Calculate offset to move bbox center to target center
      const offsetX = targetBboxCenterX - currentBboxCenterX;
      const offsetY = targetBboxCenterY - currentBboxCenterY;

      setStyle({
        width: scaledImageWidth,
        height: scaledImageHeight,
        position: "absolute",
        top: offsetY,
        left: offsetX,
        objectFit: "fill",
        transformOrigin: "0 0",
        display: "block"
      });
    }

    // Set up both load and error handlers
    const handleLoad = () => {
      setTimeout(apply, 10); // Small delay to ensure layout is complete
    };

    const handleError = () => {
      // Image error occurred
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    
    // Check if image is already loaded
    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    }

    const resizeObserver = new ResizeObserver(() => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        apply();
      }
    });
    resizeObserver.observe(img.parentElement!);
    
    return () => {
      resizeObserver.disconnect();
      img.removeEventListener('load', handleLoad);
      img.removeEventListener('error', handleError);
    };
  }, [bbox, paddingPct, src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        ref={(el) => {
          localImgRef.current = el;
          if (typeof ref === 'function') {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
        }}
        src={src}
        alt={alt}
        draggable={false}
        style={style}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;