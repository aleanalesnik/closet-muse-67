import React from "react";

type Props = {
  src: string;
  /** [x,y,w,h] (0–1, %, or pixels) OR [x1,y1,x2,y2] */
  bbox?: number[] | null;
  className?: string;
  alt?: string;

  /**
   * Keep entire bbox visible ("fit") or zoom to make bbox dominate ("fill").
   * Default is "fit" to match your design mocks (full item visible, slight padding).
   */
  mode?: "fit" | "fill";

  /**
   * Margin around the bbox.
   * - In "fit" mode: expands the effective box (less zoom) → padding around the item.
   * - In "fill" mode: shrinks the effective box (more zoom) → tighter crop.
   * Default 0.10 (10%).
   *
   * NOTE: This prop exists for backward compatibility with your call sites.
   */
  paddingPct?: number;

  /**
   * Optional alternative to padding for "fill" strength (0–1).
   * When provided and mode="fill", we shrink the effective box by `strength`.
   * e.g., 0.80 means the bbox fills ~80% of the card on each axis (strong crop).
   * Ignored in "fit" mode. If omitted, we fall back to paddingPct behavior.
   */
  strength?: number;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Normalize to [x,y,w,h] in unit space (0–1). */
function toXYWH(
  b?: number[] | null,
  iw?: number,
  ih?: number
): [number, number, number, number] | null {
  if (!b || b.length !== 4) return null;
  const arr = b.map(Number);
  if (!arr.every(Number.isFinite)) return null;

  let [a, b1, c, d] = arr;
  const max = Math.max(...arr);

  // Convert % or pixel space to unit space
  if (max > 1) {
    if (max <= 100) {
      a /= 100; b1 /= 100; c /= 100; d /= 100;
    } else {
      if (!iw || !ih) return null;
      a /= iw; b1 /= ih; c /= iw; d /= ih;
    }
  }

  if ([a, b1, c, d].some(v => v < 0 || v > 1)) return null;

  // Prefer [x,y,w,h] if sums stay within bounds
  if (a + c <= 1 && b1 + d <= 1) {
    const x = clamp01(a), y = clamp01(b1), w = clamp01(c), h = clamp01(d);
    if (w > 0 && h > 0) return [x, y, w, h];
  }

  // Otherwise treat as [x1,y1,x2,y2]
  const x1 = a, y1 = b1, x2 = c, y2 = d;
  const w = clamp01(x2 - x1);
  const h = clamp01(y2 - y1);
  if (w > 0 && h > 0) return [clamp01(x1), clamp01(y1), w, h];

  return null;
}

const SmartCropImg = React.forwardRef<HTMLImageElement, Props>(function SmartCropImg(
  {
    src,
    bbox,
    className = "",
    alt = "",
    mode = "fit",
    paddingPct = 0.10,
    strength, // optional
  },
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

    function apply() {
      const parent = img.parentElement!;
      if (!parent) return;

      const cw = parent.clientWidth;
      const ch = parent.clientHeight;
      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;
      if (!cw || !ch || !iw || !ih) return;

      const norm = toXYWH(bbox as any, iw, ih);
      if (!norm) {
        if (bbox != null) {
          console.warn("[SmartCrop] bbox present but invalid", { bbox, iw, ih, cw, ch, src });
        }
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

      const [x, y, w, h] = norm;

      // Compute effective box used for scaling
      let effW = w;
      let effH = h;

      if (mode === "fit") {
        // expand box by paddingPct → more margin, less zoom
        const pad = 1 + paddingPct;
        effW = Math.min(1, w * pad);
        effH = Math.min(1, h * pad);
      } else {
        // mode === "fill"
        if (typeof strength === "number") {
          // shrink box by strength → more zoom
          const s = Math.max(0.01, Math.min(1, strength));
          effW = Math.max(0.01, w * s);
          effH = Math.max(0.01, h * s);
        } else {
          // fallback: use paddingPct to shrink
          const pad = Math.max(0.01, 1 - paddingPct);
          effW = Math.max(0.01, w * pad);
          effH = Math.max(0.01, h * pad);
        }
      }

      const bboxWpx = effW * iw;
      const bboxHpx = effH * ih;

      // Fit uses MIN (keep fully visible). Fill uses MAX (zoom to dominate).
      const scale =
        mode === "fit"
          ? Math.min(cw / bboxWpx, ch / bboxHpx)
          : Math.max(cw / bboxWpx, ch / bboxHpx);

      const scaledW = iw * scale;
      const scaledH = ih * scale;

      // Center original bbox in the card
      const targetCx = cw / 2;
      const targetCy = ch / 2;
      const bboxCx = (x + w / 2) * iw * scale;
      const bboxCy = (y + h / 2) * ih * scale;

      const offsetX = targetCx - bboxCx;
      const offsetY = targetCy - bboxCy;

      setStyle({
        width: scaledW,
        height: scaledH,
        position: "absolute",
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        transformOrigin: "0 0",
        willChange: "transform",
        objectFit: "fill",
        display: "block",
        opacity: 1,
      });
    }

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    const onLoad = () => {
      // Safari reflow quirk
      img.offsetHeight;
      schedule();
    };
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
