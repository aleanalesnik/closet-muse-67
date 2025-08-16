import React from "react";

type BBox = [number, number, number, number];

type Props = {
  src: string;
  bbox?: BBox | null;
  paddingPct?: number; // e.g., 0.10 for 10%
  alt?: string;
  className?: string;
  onMetrics?: (m: {
    scale: number; tx: number; ty: number;
    imgW: number; imgH: number; cw: number; ch: number;
  }) => void;
};

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(({
  src, bbox, paddingPct = 0.10, alt = "", className = "", onMetrics
}: Props, ref) => {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = React.useState<{w:number; h:number} | null>(null);
  const [transform, setTransform] = React.useState<{scale:number; tx:number; ty:number} | null>(null);

  const compute = React.useCallback(() => {
    if (!imgRef.current || !wrapRef.current || !natural) return;
    const cw = wrapRef.current.clientWidth || 0;
    const ch = wrapRef.current.clientHeight || 0;
    const imgW = natural.w;
    const imgH = natural.h;

    if (!bbox || cw === 0 || ch === 0 || imgW === 0 || imgH === 0) {
      setTransform(null);
      onMetrics?.({ scale: 1, tx: 0, ty: 0, imgW, imgH, cw, ch });
      return;
    }

    // Clamp + pad bbox in original image space
    let [xmin, ymin, xmax, ymax] = bbox.map(n => Math.max(0, n)) as BBox;
    xmax = Math.min(xmax, imgW);
    ymax = Math.min(ymax, imgH);
    xmin = Math.min(xmin, xmax - 1);
    ymin = Math.min(ymin, ymax - 1);

    const bw = xmax - xmin;
    const bh = ymax - ymin;
    const pad = Math.max(bw, bh) * paddingPct;

    let pxmin = Math.max(0, xmin - pad);
    let pymin = Math.max(0, ymin - pad);
    let pxmax = Math.min(imgW, xmax + pad);
    let pymax = Math.min(imgH, ymax + pad);

    const pbw = pxmax - pxmin;
    const pbh = pymax - pymin;

    // Scale so padded bbox fits inside container
    const scale = Math.min(cw / pbw, ch / pbh);

    // Center padded bbox in container
    const bxCenter = pxmin + pbw / 2;
    const byCenter = pymin + pbh / 2;

    // After scaling, top-left of the image in container coords:
    const tx = cw / 2 - scale * bxCenter;  // translateX in px
    const ty = ch / 2 - scale * byCenter;  // translateY in px

    setTransform({ scale, tx, ty });
    onMetrics?.({ scale, tx, ty, imgW, imgH, cw, ch });
  }, [bbox, paddingPct, natural, onMetrics]);

  React.useEffect(() => {
    const i = imgRef.current;
    if (!i) return;
    if (i.complete && i.naturalWidth && i.naturalHeight) {
      setNatural({ w: i.naturalWidth, h: i.naturalHeight });
    } else {
      const onLoad = () => setNatural({ w: i.naturalWidth, h: i.naturalHeight });
      i.addEventListener("load", onLoad);
      return () => i.removeEventListener("load", onLoad);
    }
  }, [src]);

  React.useEffect(() => {
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compute]);

  return (
    <div ref={wrapRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* When we have a bbox and computed transform: absolutely position + transform the image */}
      {transform ? (
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
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: natural?.w ?? undefined,
            height: natural?.h ?? undefined,
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: "top left",
            willChange: "transform"
          }}
          draggable={false}
        />
      ) : (
        // Fallback: normal cover-fit centered
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
          className="w-full h-full object-cover object-center"
          draggable={false}
        />
      )}
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;