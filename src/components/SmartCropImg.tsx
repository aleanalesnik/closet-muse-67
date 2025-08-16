import React, { useLayoutEffect, useRef, useState } from "react";

type SmartCropImgProps = {
  src: string;
  alt?: string;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number } | number[] | null;
  className?: string;
  padding?: number;
};

/**
 * SmartCropImg: Renders images with smart cropping
 * - Default: tight center crop (cover)
 * - With bbox: zoom to detected item with ~10% padding
 * - Handles both pixel and normalized coordinates
 */
const SmartCropImg = React.forwardRef<HTMLImageElement, SmartCropImgProps>(({
  src,
  alt = "",
  bbox,
  className = "",
  padding = 0.1,
}, ref) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageStyle, setImageStyle] = useState<React.CSSProperties>({});
  const imgRef = useRef<HTMLImageElement>(null);

  const computeCrop = () => {
    const img = imgRef.current;
    if (!img || !imageLoaded) return;

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (!natW || !natH) return;

    // If no bbox, use standard cover crop
    if (!bbox) {
      setImageStyle({
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center',
      });
      return;
    }

    // Get bbox coordinates (handle both pixel and normalized, and array format)
    let xmin: number, ymin: number, xmax: number, ymax: number;
    
    if (Array.isArray(bbox) && bbox.length === 4) {
      [xmin, ymin, xmax, ymax] = bbox;
    } else if (bbox && typeof bbox === 'object' && 'xmin' in bbox) {
      ({ xmin, ymin, xmax, ymax } = bbox);
    } else {
      return;
    }
    
    // If coordinates are between 0-1, assume normalized
    if (xmax <= 1 && ymax <= 1) {
      xmin *= natW;
      ymin *= natH;
      xmax *= natW;
      ymax *= natH;
    }

    // Add padding
    const bw = xmax - xmin;
    const bh = ymax - ymin;
    const pad = padding;
    
    xmin = Math.max(0, xmin - bw * pad);
    ymin = Math.max(0, ymin - bh * pad);
    xmax = Math.min(natW, xmax + bw * pad);
    ymax = Math.min(natH, ymax + bh * pad);

    const cropW = xmax - xmin;
    const cropH = ymax - ymin;
    
    // Calculate position percentages for object-position
    const centerX = (xmin + cropW / 2) / natW;
    const centerY = (ymin + cropH / 2) / natH;

    // Calculate scale for object-fit
    const scaleX = natW / cropW;
    const scaleY = natH / cropH;
    const scale = Math.min(scaleX, scaleY);

    setImageStyle({
      width: `${scale * 100}%`,
      height: `${scale * 100}%`,
      objectFit: 'cover',
      objectPosition: `${centerX * 100}% ${centerY * 100}%`,
    });
  };

  useLayoutEffect(() => {
    computeCrop();
  }, [bbox, imageLoaded]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-white ${className}`}>
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
        className="w-full h-full"
        style={imageStyle}
        onLoad={() => {
          setImageLoaded(true);
        }}
        loading="lazy"
      />
    </div>
  );
});

SmartCropImg.displayName = 'SmartCropImg';

export default SmartCropImg;