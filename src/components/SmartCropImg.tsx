import React from "react";
import { padBox, cropStyle, type BBox } from "@/utils/crop";

type AnyBBox = BBox | number[] | null | undefined;

type Props = {
  src: string;
  bbox?: AnyBBox;
  paddingPct?: number; // default 0.10
  alt?: string;
  className?: string;
  onMetrics?: (m:{
    scale:number; tx:number; ty:number;
    imgW:number; imgH:number; cw:number; ch:number;
  })=>void;
};

// Helper: normalize bbox to [x1,y1,x2,y2] 0-1 format
function normalizeBbox(b: AnyBBox): BBox | null {
  if (!b) return null;
  
  if (Array.isArray(b) && b.length === 4) {
    const [a, b1, c, d] = b.map(n => Number(n));
    if ([a, b1, c, d].some(Number.isNaN)) return null;
    return [a, b1, c, d] as BBox;
  }
  
  return null;
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(({
  src, bbox, paddingPct = 0.10, alt = "", className = "", onMetrics
}: Props, ref) => {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = React.useState<{w:number; h:number} | null>(null);
  const [cropTransform, setCropTransform] = React.useState<string | null>(null);

  const compute = React.useCallback(() => {
    if (!imgRef.current || !wrapRef.current || !natural) return;
    const cw = wrapRef.current.clientWidth || 0;
    const ch = wrapRef.current.clientHeight || 0;
    const imgW = natural.w, imgH = natural.h;

    const normalizedBbox = normalizeBbox(bbox);

    if (!normalizedBbox || cw === 0 || ch === 0) {
      setCropTransform(null);
      onMetrics?.({ scale: 1, tx: 0, ty: 0, imgW, imgH, cw, ch });
      return;
    }

    // Add padding and compute transform
    const paddedBbox = padBox(normalizedBbox, paddingPct);
    const style = cropStyle(paddedBbox, cw, ch, imgW, imgH);
    
    setCropTransform(style.transform);
    
    // Extract metrics from transform for onMetrics callback
    const transformMatch = style.transform.match(/translate\(([^,]+)px,\s*([^)]+)px\) scale\(([^)]+)\)/);
    if (transformMatch) {
      const tx = parseFloat(transformMatch[1]);
      const ty = parseFloat(transformMatch[2]); 
      const scale = parseFloat(transformMatch[3]);
      onMetrics?.({ scale, tx, ty, imgW, imgH, cw, ch });
    }
  }, [bbox, paddingPct, natural, onMetrics]);

  React.useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const setN = () => setNatural({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    if (img.complete) setN();
    else img.addEventListener("load", setN);
    return () => img.removeEventListener("load", setN);
  }, [src]);

  React.useEffect(() => {
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compute]);

  return (
    <div ref={wrapRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      <img
        ref={(node) => {
          imgRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        src={src}
        alt={alt}
        style={cropTransform ? {
          position: "absolute",
          top: 0, left: 0,
          width: natural?.w ?? undefined,
          height: natural?.h ?? undefined,
          transform: cropTransform,
          transformOrigin: "top left",
          willChange: "transform"
        } : undefined}
        className={cropTransform ? undefined : "w-full h-full object-cover object-center"}
        draggable={false}
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;