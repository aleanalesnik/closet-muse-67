import React, { useLayoutEffect, useRef, useState } from "react";
import { isValidItemBox, toBBox, type Det } from "@/lib/aiMapping";

type SmartCropImgProps = {
  src: string;                 
  bbox?: [number, number, number, number] | null; 
  aspect?: number;             
  pad?: number;                
  className?: string;          
  alt?: string;                
  label?: string;              
};

/**
 * SmartCropImg: Renders images with smart cropping
 * - Default: centered cover crop
 * - With valid garment bbox: zoomed to show the detected item
 * - Ignores part-level detections (sleeves, collars, etc.)
 */
export default function SmartCropImg({
  src,
  bbox,
  aspect = 1,
  pad = 0.08,
  className = "",
  alt = "",
  label = "",
}: SmartCropImgProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap || !loaded) return;

    const W = img.naturalWidth || 1;
    const H = img.naturalHeight || 1;
    const cw = wrap.clientWidth || 1;
    const ch = wrap.clientHeight || 1;

    // Check if we should apply zoom based on bbox validity
    const bboxObj = bbox ? { xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3] } : null;
    const detForValidation: Det = {
      label: label || "",
      score: 1,
      box: bboxObj || undefined
    };
    
    const shouldZoom = bboxObj && isValidItemBox(detForValidation);

    // If we have a valid bbox for a garment (not a part), zoom to it
    if (shouldZoom && bboxObj) {
      let [x1, y1, x2, y2] = bbox!;
      
      // Add padding around bbox
      const bw = x2 - x1;
      const bh = y2 - y1;
      x1 = Math.max(0, x1 - bw * pad);
      y1 = Math.max(0, y1 - bh * pad);
      x2 = Math.min(W, x2 + bw * pad);
      y2 = Math.min(H, y2 + bh * pad);

      const cropW = Math.max(1, x2 - x1);
      const cropH = Math.max(1, y2 - y1);
      const cx = x1 + cropW / 2;
      const cy = y1 + cropH / 2;

      // Scale so padded bbox fits container
      const s = Math.max(cw / cropW, ch / cropH);
      const renderedW = W * s;
      const renderedH = H * s;

      // Translate so bbox center sits at container center
      const tx = Math.round(cw / 2 - cx * s);
      const ty = Math.round(ch / 2 - cy * s);

      setStyle({
        width: `${renderedW}px`,
        height: `${renderedH}px`,
        transform: `translate(${tx}px, ${ty}px)`,
      });
    } else {
      // Fallback: centered "cover" crop
      const s = Math.max(cw / W, ch / H);
      setStyle({
        width: `${W * s}px`,
        height: `${H * s}px`,
        transform: `translate(${(cw - W * s) / 2}px, ${(ch - H * s) / 2}px)`,
      });
    }
  }, [bbox, loaded, pad, label]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden bg-white ${className}`}
      style={{ aspectRatio: aspect.toString() }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className="absolute top-0 left-0 will-change-transform"
        style={style}
        draggable={false}
      />
    </div>
  );
}