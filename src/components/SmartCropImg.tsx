// src/components/SmartCropImg.tsx
import * as React from "react";

type Props = {
  src: string;
  bbox?: number[] | null; // normalized [x,y,w,h]
  padding?: number;       // e.g. 0.10 = 10%
  className?: string;
  alt?: string;
};

// We render a div with background-image for precise control.
// If bbox missing, we fallback to object-fit: cover.
export default function SmartCropImg({ src, bbox, padding = 0.10, className = "", alt = "" }: Props) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({
    width: "100%", height: "100%", backgroundImage: `url(${src})`,
    backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "cover",
  });

  React.useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      if (!bbox || bbox.length !== 4) {
        setStyle({
          width: "100%", height: "100%",
          backgroundImage: `url(${src})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover",
        });
        return;
      }
      const [x, y, w, h] = bbox;
      const pad = Math.min(0.2, Math.max(0, padding));
      const cx = x + w / 2, cy = y + h / 2;
      const wP = w * (1 + pad), hP = h * (1 + pad);

      // scale so padded box fills container
      const scale = Math.max(wP, hP);
      const zoom = 1 / Math.max(0.01, scale);

      const ox = Math.round(cx * 100);
      const oy = Math.round(cy * 100);

      setStyle({
        width: "100%", height: "100%",
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `${ox}% ${oy}%`,
        backgroundSize: `${zoom * 100}% auto`,
      });
    };

    img.addEventListener("load", onLoad, { once: true });
    if (img.complete) onLoad();
    return () => img.removeEventListener("load", onLoad);
  }, [src, JSON.stringify(bbox), padding]);

  return (
    <div className={className} style={{ position: "relative", overflow: "hidden" }}>
      <div style={style} />
      {/* hidden loader to get reliable onLoad timing */}
      <img ref={imgRef} src={src} alt={alt} style={{ display: "none" }} />
    </div>
  );
}
