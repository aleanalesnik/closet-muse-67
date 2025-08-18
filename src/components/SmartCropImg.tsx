import React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // normalized [x, y, w, h]
  paddingPct?: number;
  className?: string;
  alt?: string;
};

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

      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
        console.log('[SmartCropImg] ==> Using fallback - no valid bbox', { 
          bbox, 
          bboxIsArray: Array.isArray(bbox), 
          bboxLength: bbox?.length
        });
        setStyle({ 
          width: "100%", 
          height: "100%", 
          objectFit: "contain", 
          objectPosition: "center",
          display: "block"
        });
        return;
      }

      const [x, y, w, h] = bbox; // normalized [0..1]
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
    <div className={`relative overflow-hidden flex items-center justify-center ${className}`}>
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
        className="max-w-full max-h-full"
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;