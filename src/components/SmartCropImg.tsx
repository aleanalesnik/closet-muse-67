import React from "react";

type BBoxArr = [number, number, number, number];
type AnyBBox =
  | BBoxArr
  | { xmin:number; ymin:number; xmax:number; ymax:number }
  | { x:number; y:number; w:number; h:number }
  | null
  | undefined;

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

// ---- Helper: coerce any bbox to [xmin,ymin,xmax,ymax] in pixels ----
function coerceBboxToPixels(b: AnyBBox, imgW: number, imgH: number): BBoxArr | null {
  if (!b || imgW <= 0 || imgH <= 0) return null;

  let xmin:number, ymin:number, xmax:number, ymax:number;

  const clamp = (v:number, max:number) => Math.max(0, Math.min(v, max));

  const isNorm = (vals:number[]) =>
    vals.every(v => v >= 0 && v <= 1);

  if (Array.isArray(b) && b.length === 4) {
    const [a,b2,c,d] = b.map(n => Number(n));
    if ([a,b2,c,d].some(Number.isNaN)) return null;

    if (isNorm([a,b2,c,d])) {
      // Heuristic: if a+c <= 1 and b2+d <= 1 → treat as [x,y,w,h] normalized.
      // Else, treat as [xmin,ymin,xmax,ymax] normalized.
      if (a + c <= 1.0001 && b2 + d <= 1.0001) {
        xmin = a * imgW; ymin = b2 * imgH;
        xmax = (a + c) * imgW; ymax = (b2 + d) * imgH;
      } else {
        xmin = a * imgW; ymin = b2 * imgH;
        xmax = c * imgW; ymax = d * imgH;
      }
    } else {
      // Assume pixels; could be [x,y,w,h] or [xmin,ymin,xmax,ymax]
      if (a <= c && b2 <= d) {
        xmin = a; ymin = b2; xmax = c; ymax = d;
      } else {
        // treat as [x,y,w,h] pixels
        xmin = a; ymin = b2; xmax = a + c; ymax = b2 + d;
      }
    }
  } else if (typeof b === "object") {
    const any = b as any;
    if ("xmin" in any && "ymin" in any && "xmax" in any && "ymax" in any) {
      let { xmin: X, ymin: Y, xmax: R, ymax: B } = any;
      [X,Y,R,B] = [X,Y,R,B].map(Number);
      if (isNorm([X,Y,R,B])) {
        xmin = X * imgW; ymin = Y * imgH; xmax = R * imgW; ymax = B * imgH;
      } else {
        xmin = X; ymin = Y; xmax = R; ymax = B;
      }
    } else if ("x" in any && "y" in any && ("w" in any || "width" in any) && ("h" in any || "height" in any)) {
      let x = Number(any.x), y = Number(any.y);
      let w = Number(any.w ?? any.width), h = Number(any.h ?? any.height);
      if (isNorm([x,y,w,h])) {
        xmin = x * imgW; ymin = y * imgH;
        xmax = (x + w) * imgW; ymax = (y + h) * imgH;
      } else {
        xmin = x; ymin = y; xmax = x + w; ymax = y + h;
      }
    } else {
      return null;
    }
  } else {
    return null;
  }

  // Clamp & ensure order
  xmin = clamp(xmin, imgW);
  ymin = clamp(ymin, imgH);
  xmax = clamp(xmax, imgW);
  ymax = clamp(ymax, imgH);
  if (xmax - xmin < 1 || ymax - ymin < 1) return null;

  // Ensure min..max
  const X = Math.min(xmin, xmax), R = Math.max(xmin, xmax);
  const Y = Math.min(ymin, ymax), B = Math.max(ymin, ymax);
  return [X, Y, R, B];
}

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
    const imgW = natural.w, imgH = natural.h;

    const pxBox = coerceBboxToPixels(bbox, imgW, imgH);

    if (!pxBox || cw === 0 || ch === 0) {
      setTransform(null);
      onMetrics?.({ scale: 1, tx: 0, ty: 0, imgW, imgH, cw, ch });
      return;
    }

    let [xmin, ymin, xmax, ymax] = pxBox;
    const bw = xmax - xmin, bh = ymax - ymin;

    // Padding based on the larger dimension
    const pad = Math.max(bw, bh) * paddingPct;
    let pxmin = Math.max(0, xmin - pad);
    let pymin = Math.max(0, ymin - pad);
    let pxmax = Math.min(imgW, xmax + pad);
    let pymax = Math.min(imgH, ymax + pad);

    const pbw = pxmax - pxmin, pbh = pymax - pymin;

    const scale = Math.min(cw / pbw, ch / pbh);

    const bxCenter = pxmin + pbw / 2;
    const byCenter = pymin + pbh / 2;

    const tx = cw / 2 - scale * bxCenter;
    const ty = ch / 2 - scale * byCenter;

    setTransform({ scale, tx, ty });
    onMetrics?.({ scale, tx, ty, imgW, imgH, cw, ch });
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