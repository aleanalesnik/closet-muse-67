import React, { useLayoutEffect, useRef, useState } from "react";

type SmartCropImgProps = {
  src: string;                 // public URL from Supabase storage
  bbox?: [number, number, number, number] | null; // [xmin,ymin,xmax,ymax] in px of the original image
  natural?: { w: number; h: number } | null;      // original dimensions if we have them
  aspect?: number;             // container aspect ratio (default 1 for cards, 4/3 for details)
  pad?: number;                // padding around bbox (default 0.08 = 8%)
  className?: string;          // extra classes for border radius/shadow
  alt?: string;                // alt text (for accessibility)
};

/**
 * SmartCropImg:
 * - Renders a background-image div for precise crop/zoom control
 * - Before YOLOS: shows a centered cover crop (tight, centered)
 * - After YOLOS: auto-zooms to bbox with padding
 * - Configurable aspect ratio for different contexts
 */
export default function SmartCropImg({
  src,
  bbox,
  natural,
  aspect = 1,
  pad = 0.08,
  className = "",
  alt = "",
}: SmartCropImgProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(natural);
  const [backgroundStyle, setBackgroundStyle] = useState<React.CSSProperties>({
    backgroundImage: `url(${src})`,
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#fff',
  });

  // Load natural dimensions if not provided
  useLayoutEffect(() => {
    if (natural) {
      setImageDimensions(natural);
      setImageLoaded(true);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageLoaded(true); // Still set loaded to show fallback
    };
    img.src = src;
  }, [src, natural]);

  // Compute background position and size
  useLayoutEffect(() => {
    if (!imageLoaded || !imageDimensions || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerW = containerRect.width || 300;
    const containerH = containerRect.height || containerW / aspect;

    const { w: imageW, h: imageH } = imageDimensions;

    let backgroundPosition = '50% 50%'; // default center
    let backgroundSize = 'cover'; // default cover crop

    // If we have a bbox, compute precise positioning
    if (bbox && bbox.length === 4) {
      let [x1, y1, x2, y2] = bbox;
      
      // Add padding around bbox
      const bboxW = x2 - x1;
      const bboxH = y2 - y1;
      x1 = Math.max(0, x1 - bboxW * pad);
      y1 = Math.max(0, y1 - bboxH * pad);
      x2 = Math.min(imageW, x2 + bboxW * pad);
      y2 = Math.min(imageH, y2 + bboxH * pad);

      const paddedW = x2 - x1;
      const paddedH = y2 - y1;
      const centerX = x1 + paddedW / 2;
      const centerY = y1 + paddedH / 2;

      // Scale so padded bbox fits container (choose larger scale to ensure bbox fits)
      const scaleX = containerW / paddedW;
      const scaleY = containerH / paddedH;
      const scale = Math.max(scaleX, scaleY);

      // Set background size
      const scaledImageW = imageW * scale;
      const scaledImageH = imageH * scale;
      backgroundSize = `${scaledImageW}px ${scaledImageH}px`;

      // Position based on bbox center
      const posX = (centerX / imageW) * 100;
      const posY = (centerY / imageH) * 100;
      backgroundPosition = `${posX}% ${posY}%`;
    }

    setBackgroundStyle({
      backgroundImage: `url(${src})`,
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#fff',
      backgroundPosition,
      backgroundSize,
    });
  }, [src, bbox, aspect, pad, imageLoaded, imageDimensions]);

  return (
    <div 
      ref={containerRef}
      className={`smartcrop ${className}`}
      style={{ 
        aspectRatio: aspect.toString(),
        ...backgroundStyle 
      }}
      role="img"
      aria-label={alt}
    />
  );
}