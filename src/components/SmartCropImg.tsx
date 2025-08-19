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
  console.log("[SmartCrop] toXYWH input:", { b, iw, ih });
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
  // Create a local ref for internal use
  const localImgRef = React.useRef<HTMLImageElement>(null);
  const [isReady, setIsReady] = React.useState(false);
  const [style, setStyle] = React.useState<React.CSSProperties>({ 
    opacity: 0,
    width: "100%", 
    height: "100%", 
    objectFit: "contain", 
    objectPosition: "center" 
  });
  
  React.useLayoutEffect(() => {
    const img = localImgRef.current;
    if (!img) return;

    let debounceTimer: NodeJS.Timeout;

    function apply() {
      const container = img.parentElement!;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;

      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;

      // Don't process if image or container dimensions aren't ready yet
      if (iw === 0 || ih === 0 || cw === 0 || ch === 0) {
        return;
      }

      console.log("[SmartCrop] Processing bbox:", { bbox, iw, ih, cw, ch, src: src.slice(-20) });
      const safe = toXYWH(bbox as any, iw, ih);
      if (!safe) {
        // Only warn if a bbox was present but couldn't be parsed
        if (bbox != null) {
          console.warn("[SmartCrop] bbox present but invalid", { bbox, iw, ih, cw, ch, src });
        }
        setStyle({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
          opacity: 1
        });
        setIsReady(true);
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
      const currentBboxCenterX = (x + w / 2) * iw * scale;
      const currentBboxCenterY = (y + h / 2) * ih * scale;
      
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
        display: "block",
        opacity: 1
      });
      setIsReady(true);
    }

    const debouncedApply = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(apply, 5);
    };

    // Set up both load and error handlers
    const handleLoad = () => {
      apply(); // No timeout needed
    };

    const handleError = () => {
      // Image error occurred, show fallback
      setStyle(prev => ({ ...prev, opacity: 1 }));
      setIsReady(true);
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    
    // Check if image is already loaded
    if (img.complete && img.naturalWidth > 0) {
      handleLoad();
    }

    const resizeObserver = new ResizeObserver(() => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        debouncedApply();
      }
    });
    resizeObserver.observe(img.parentElement!);
    
    return () => {
      clearTimeout(debounceTimer);
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