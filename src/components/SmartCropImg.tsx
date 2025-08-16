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

      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4 || iw === 0 || ih === 0) {
        setStyle({ 
          width: "100%", 
          height: "100%", 
          objectFit: "contain", 
          objectPosition: "center" 
        });
        return;
      }

      const [x, y, w, h] = bbox; // normalized [0..1]
      const ow = w * iw;
      const oh = h * ih;

      const pad = 1 + paddingPct; // e.g., 1.10 for 10% slack
      const scale = Math.min(cw / (ow * pad), ch / (oh * pad));

      // Calculate the offset to center the bbox within the container
      const offsetX = cw / 2 - (x + w/2) * iw * scale;
      const offsetY = ch / 2 - (y + h/2) * ih * scale;

      setStyle({
        width: iw * scale,
        height: ih * scale,
        position: "absolute",
        top: offsetY,
        left: offsetX,
        objectFit: "fill",
        transformOrigin: "0 0"
      });
    }

    if (img.complete) {
      apply();
    } else {
      img.addEventListener('load', apply, { once: true });
    }

    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(img.parentElement!);
    
    return () => {
      resizeObserver.disconnect();
      img.removeEventListener('load', apply);
    };
  }, [bbox, paddingPct]);

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