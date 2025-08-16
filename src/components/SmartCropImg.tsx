import React, { useLayoutEffect, useRef, useState } from "react";

type BBox = [number, number, number, number]; // [xmin, ymin, xmax, ymax]

type Props = {
  src: string;
  /** original-image-space bbox (pixels). If absent, we just center-cover */
  bbox?: BBox | null;
  /** extra padding around bbox (fraction of bbox size). Default 0.08 (8%) */
  pad?: number;
  /** extra classes for the outer wrapper */
  className?: string;
  /** alt text */
  alt?: string;
};

/**
 * SmartCropImg:
 * - Before YOLOS: shows a centered cover crop (nice immediate look)
 * - After YOLOS: computes a transform so the bbox tightly fills the container with small padding
 * - Always centered, container is overflow-hidden
 */
export default function SmartCropImg({
  src,
  bbox,
  pad = 0.08,
  className = "",
  alt = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return;

    const W = img.naturalWidth || 1;
    const H = img.naturalHeight || 1;
    const cw = wrap.clientWidth || 1;
    const ch = wrap.clientHeight || 1;

    // If we have a bbox, zoom so that padded bbox fills the container.
    if (bbox && bbox.length === 4) {
      let [x1, y1, x2, y2] = bbox;
      // pad outward by % of bbox size
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

      // scale so padded bbox fits container
      const s = Math.max(cw / cropW, ch / cropH);
      const renderedW = W * s;
      const renderedH = H * s;

      // translate so bbox center sits at container center
      const tx = Math.round(cw / 2 - cx * s);
      const ty = Math.round(ch / 2 - cy * s);

      setStyle({
        width: `${renderedW}px`,
        height: `${renderedH}px`,
        transform: `translate(${tx}px, ${ty}px)`,
      });
    } else {
      // Fallback: pleasant centered "cover" crop
      const s = Math.max(cw / W, ch / H);
      setStyle({
        width: `${W * s}px`,
        height: `${H * s}px`,
        transform: `translate(${(cw - W * s) / 2}px, ${(ch - H * s) / 2}px)`,
      });
    }
  }, [bbox, loaded]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl bg-white ${className}`}
    >
      {/* Keep a consistent thumbnail shape everywhere (square by default) */}
      <div className="pointer-events-none select-none aspect-square" />
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
