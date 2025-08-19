import React from "react";

type Props = {
  src: string;
  /** [x,y,w,h] (0–1, %, or px) OR [x1,y1,x2,y2] */
  bbox?: number[] | null;
  className?: string;
  alt?: string;
  /** Keep entire bbox visible (your desired grid look) */
  mode?: "fit" | "fill";       // default "fit"
  /** Padding around the bbox (fit: expand box; fill: shrink box) */
  paddingPct?: number;         // default 0.10
  /** Optional fill strength; ignored in "fit" mode */
  strength?: number;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Normalize to [x,y,w,h] in unit space (0–1). Prefer XYWH; fallback XYXY only if XYWH impossible. */
function toXYWH(
  b?: number[] | null,
  iw?: number,
  ih?: number
): [number, number, number, number] | null {
  if (!b || b.length !== 4) return null;
  let [a, b1, c, d] = b.map(Number);
  if (![a, b1, c, d].every(Number.isFinite)) return null;

  const max = Math.max(a, b1, c, d);
  if (max > 1) {
    if (max <= 100) { a/=100; b1/=100; c/=100; d/=100; }
    else { if (!iw || !ih) return null; a/=iw; b1/=ih; c/=iw; d/=ih; }
  }

  // Try XYWH first (what your edge returns)
  const x = a, y = b1, w = c, h = d;
  const xywhValid = x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.00001 && y + h <= 1.00001;
  if (xywhValid) return [clamp01(x), clamp01(y), clamp01(w), clamp01(h)];

  // Fallback: XYXY
  const x1 = a, y1 = b1, x2 = c, y2 = d;
  const w2 = x2 - x1, h2 = y2 - y1;
  const xyxyValid = x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1 && w2 > 0 && h2 > 0;
  if (xyxyValid) return [clamp01(x1), clamp01(y1), clamp01(w2), clamp01(h2)];

  return null;
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(function SmartCropImg(
  { src, bbox, className = "", alt = "", mode = "fit", paddingPct = 0.10, strength },
  ref
) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({
    opacity: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center",
  });

  React.useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    let rafId = 0;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    function apply() {
      const parent = img.parentElement!;
      if (!parent) return;

      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;
      if (!cw || !ch || !iw || !ih) return;

      const safe = toXYWH(bbox as any, iw, ih);
      if (!safe) {
        if (bbox != null) console.warn("[SmartCrop] bbox present but invalid", { bbox, iw, ih, cw, ch, src });
        setStyle({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
          opacity: 1,
        });
        return;
      }

      const [x, y, w, h] = safe;

      if (mode === "fit") {
        // center the subject but keep the entire image visible and undistorted
        const cx = (x + w / 2) * 100;
        const cy = (y + h / 2) * 100;

        setStyle({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: `${cx}% ${cy}%`, // aim the subject at the center
          display: "block",
          opacity: 1
        });
        return; // IMPORTANT: skip all the scale/translate math below
      }

      // Effective box used for scaling (padding logic) - only for "fill" mode
      let effW = w, effH = h;
      
      // "fill" mode
      if (typeof strength === "number") {
        const s = clamp01(strength);
        effW = Math.max(0.01, w * s);
        effH = Math.max(0.01, h * s);
      } else {
        const pad = Math.max(0.01, 1 - paddingPct); // shrink => more zoom
        effW = Math.max(0.01, w * pad);
        effH = Math.max(0.01, h * pad);
      }

      const bboxWpx = effW * iw;
      const bboxHpx = effH * ih;

      // Fill mode: zoom so bbox dominates.
      const scale = Math.max(cw / bboxWpx, ch / bboxHpx);

      const scaledW = iw * scale;
      const scaledH = ih * scale;

      // Center original bbox in the card
      const targetCx = cw / 2;
      const targetCy = ch / 2;
      const bboxCx = (x + w / 2) * iw * scale;
      const bboxCy = (y + h / 2) * ih * scale;

      // Raw offsets to center the bbox
      const offsetX = targetCx - bboxCx;
      const offsetY = targetCy - bboxCy;

      // *** Critical fix: clamp translate so the image can't slide out of view ***
      const bounds = (scaled: number, container: number) =>
        scaled >= container ? [container - scaled, 0] as const : [0, container - scaled] as const;

      const [minX, maxX] = bounds(scaledW, cw);
      const [minY, maxY] = bounds(scaledH, ch);

      const tx = clamp(offsetX, minX, maxX);
      const ty = clamp(offsetY, minY, maxY);

      // Safety fallback: if intersection area is ~0 (somehow), center the whole image.
      const visibleW = Math.max(0, Math.min(cw, Math.min(cw - tx, scaledW)));
      const visibleH = Math.max(0, Math.min(ch, Math.min(ch - ty, scaledH)));
      const visibleArea = visibleW * visibleH;
      if (visibleArea < 1) {
        setStyle({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: `${(x + w / 2) * 100}% ${(y + h / 2) * 100}%`,
          display: "block",
          opacity: 1,
        });
        return;
      }

      setStyle({
        width: scaledW,
        height: scaledH,
        position: "absolute",
        transform: `translate(${tx}px, ${ty}px)`,
        transformOrigin: "0 0",
        willChange: "transform",
        objectFit: "fill",
        display: "block",
        opacity: 1,
      });
    }

    const schedule = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(apply); };
    const onLoad = () => { img.offsetHeight; schedule(); }; // Safari reflow quirk
    const onError = () => setStyle(s => ({ ...s, opacity: 1 }));

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    if (img.complete && img.naturalWidth > 0) onLoad();

    const ro = new ResizeObserver(schedule);
    ro.observe(img.parentElement!);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [bbox, src, mode, paddingPct, strength]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        ref={(el) => {
          imgRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLImageElement | null>).current = el;
        }}
        src={src}
        alt={alt}
        draggable={false}
        style={style}
      />
    </div>
  );
});

export default SmartCropImg;
