import React, { useLayoutEffect, useRef, useState } from "react";
import { isValidItemBox, toBBox, type Det } from "@/lib/aiMapping";

type SmartCropImgProps = {
  src: string;                 // public URL from Supabase storage
  bbox?: [number, number, number, number] | null; // [xmin,ymin,xmax,ymax] in px of the original image
  natural?: { w: number; h: number } | null;      // original dimensions if we have them
  aspect?: number;             // container aspect ratio (default 1 for cards, 4/3 for details)
  pad?: number;                // padding around bbox (default 0.08 = 8%)
  className?: string;          // extra classes for border radius/shadow
  alt?: string;                // alt text (for accessibility)
  label?: string;              // detection label for validation
};

function computeZoomStyle(
  bbox: [number, number, number, number], 
  natural: { w: number; h: number },
  containerW: number, 
  containerH: number, 
  padding: number
): React.CSSProperties {
  const [xmin, ymin, xmax, ymax] = bbox;
  const { w: imageW, h: imageH } = natural;
  
  // Add padding around bbox
  const bboxW = xmax - xmin;
  const bboxH = ymax - ymin;
  const paddedXmin = Math.max(0, xmin - bboxW * padding);
  const paddedYmin = Math.max(0, ymin - bboxH * padding);
  const paddedXmax = Math.min(imageW, xmax + bboxW * padding);
  const paddedYmax = Math.min(imageH, ymax + bboxH * padding);

  const paddedW = paddedXmax - paddedXmin;
  const paddedH = paddedYmax - paddedYmin;
  const centerX = paddedXmin + paddedW / 2;
  const centerY = paddedYmin + paddedH / 2;

  // Scale so padded bbox fits container (choose larger scale to ensure bbox fits)
  const scaleX = containerW / paddedW;
  const scaleY = containerH / paddedH;
  const scale = Math.max(scaleX, scaleY);

  // Set background size
  const scaledImageW = imageW * scale;
  const scaledImageH = imageH * scale;

  // Position based on bbox center
  const posX = (centerX / imageW) * 100;
  const posY = (centerY / imageH) * 100;

  return {
    width: `${scaledImageW}px`,
    height: `${scaledImageH}px`,
    transform: `translate(${containerW / 2 - centerX * scale}px, ${containerH / 2 - centerY * scale}px)`,
  };
}

/**
 * SmartCropImg:
 * - Renders a background-image div for precise crop/zoom control
 * - Before YOLOS: shows a centered cover crop (tight, centered)
 * - After YOLOS: auto-zooms to bbox with padding, but only for valid item boxes
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
  label = "",
}: SmartCropImgProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(natural);
  const [backgroundStyle, setBackgroundStyle] = useState<React.CSSProperties>({
    backgroundImage: `url(${src})`,
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#fff',
    backgroundPosition: '50% 50%',
    backgroundSize: 'cover',
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

    let backgroundPosition = '50% 50%'; // default center
    let backgroundSize = 'cover'; // default cover crop

    // Check if we should apply zoom based on bbox validity
    const bboxObj = bbox ? toBBox(bbox) : null;
    const detForValidation: Det = {
      label: label || "",
      score: 1,
      box: bboxObj || undefined
    };
    
    const shouldZoom = bboxObj && isValidItemBox(detForValidation);

    // If we have a valid bbox for a garment (not a part), compute precise positioning
    if (shouldZoom && bboxObj) {
      const style = computeZoomStyle(bbox!, imageDimensions, containerW, containerH, pad);
      setBackgroundStyle({
        backgroundImage: `url(${src})`,
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#fff',
        backgroundPosition: '0 0', // position via transform in style
        backgroundSize: `${style.width} ${style.height}`,
        transform: style.transform,
      });
      return;
    }

    // Default: centered cover crop
    setBackgroundStyle({
      backgroundImage: `url(${src})`,
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#fff',
      backgroundPosition,
      backgroundSize,
    });
  }, [src, bbox, aspect, pad, label, imageLoaded, imageDimensions]);

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