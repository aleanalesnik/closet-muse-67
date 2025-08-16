// Cropping utilities for SmartCropImg

export type BBox = [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1

export function padBox(bbox: BBox, paddingPct: number = 0.1): BBox {
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  
  // Add padding based on the larger dimension
  const pad = Math.max(w, h) * paddingPct;
  
  return [
    Math.max(0, x1 - pad),
    Math.max(0, y1 - pad), 
    Math.min(1, x2 + pad),
    Math.min(1, y2 + pad)
  ];
}

export function cropStyle(
  paddedBbox: BBox,
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): { transform: string } | { transform: string } {
  const [px1, py1, px2, py2] = paddedBbox;
  
  // Convert normalized padded bbox to pixel coords in original image
  const pxmin = px1 * imageWidth;
  const pymin = py1 * imageHeight;
  const pxmax = px2 * imageWidth;
  const pymax = py2 * imageHeight;
  
  const pbw = pxmax - pxmin;
  const pbh = pymax - pymin;
  
  // Scale so padded bbox fits inside container
  const scale = Math.min(containerWidth / pbw, containerHeight / pbh);
  
  // Center padded bbox in container
  const bxCenter = pxmin + pbw / 2;
  const byCenter = pymin + pbh / 2;
  
  const tx = containerWidth / 2 - scale * bxCenter;
  const ty = containerHeight / 2 - scale * byCenter;
  
  return {
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`
  };
}