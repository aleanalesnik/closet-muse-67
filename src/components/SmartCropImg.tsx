import React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // normalized [x, y, w, h]
  paddingPct?: number;
  className?: string;
  alt?: string;
};

// Accept either [x,y,w,h] or [x1,y1,x2,y2] (all normalized 0..1) and return [x,y,w,h]
function toXYWH(b?: number[] | null): [number, number, number, number] | null {
  if (!b || !Array.isArray(b) || b.length !== 4) return null;
  let [a, b1, c, d] = b.map(Number);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  a = clamp(a); b1 = clamp(b1); c = clamp(c); d = clamp(d);

  // If c>a and d>b1, this looks like [x1,y1,x2,y2] -> convert
  if (c > a && d > b1) {
    const w = clamp(c - a);
    const h = clamp(d - b1);
    if (w <= 0 || h <= 0) return null;
    return [a, b1, w, h];
  }

  // Already [x,y,w,h]
  if (c <= 0 || d <= 0) return null;
  return [a, b1, c, d];
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

      console.log('[SmartCropImg] ==> apply() called', { 
        bbox, 
        src: src.substring(0, 50) + '...', 
        iw, 
        ih, 
        cw, 
        ch,
        complete: img.complete 
      });

      // Don't process if image dimensions aren't ready yet
      if (iw === 0 || ih === 0) {
        console.log('[SmartCropImg] ==> Skipping - image not loaded yet');
        return;
      }

      const xywh = toXYWH(bbox);
      if (!xywh) {
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

      const [x, y, w, h] = xywh;
      console.log('[SmartCropImg] ==> Processing bbox:', { x, y, w, h, iw, ih, cw, ch });
      
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

      console.log('[SmartCropImg] ==> Final calculations:', { 
        scale, 
        scaledImageWidth, 
        scaledImageHeight, 
        targetBboxCenterX, 
        targetBboxCenterY, 
        currentBboxCenterX, 
        currentBboxCenterY,
        offsetX, 
        offsetY,
        finalStyle: {
          width: scaledImageWidth,
          height: scaledImageHeight,
          top: offsetY,
          left: offsetX
        }
      });

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
      console.log('[SmartCropImg] ==> Image loaded');
      setTimeout(apply, 10); // Small delay to ensure layout is complete
    };

    const handleError = () => {
      console.log('[SmartCropImg] ==> Image error');
    };

    img.addEventListener('load', handleLoad);
    img.addEventListener('error', handleError);
    
    // Check if image is already loaded
    if (img.complete && img.naturalWidth > 0) {
      console.log('[SmartCropImg] ==> Image already loaded');
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