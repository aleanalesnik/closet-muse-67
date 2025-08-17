import React from 'react';

type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { label: string; score: number; box: YolosBox };

type Props = {
  preds?: YolosPred[] | null;
  naturalWidth: number;   // from <img>.naturalWidth
  naturalHeight: number;  // from <img>.naturalHeight
  renderedWidth: number;  // from container/image clientWidth
  renderedHeight: number; // from container/image clientHeight
  itemBbox?: number[] | null; // The smart crop bbox that SmartCropImg is using
  paddingPct?: number; // The padding SmartCropImg is using
};

export default function DetectionsOverlay({
  preds = [],
  naturalWidth, 
  naturalHeight, 
  renderedWidth, 
  renderedHeight,
  itemBbox,
  paddingPct = 0.1,
}: Props) {
  if (!preds || preds.length === 0 || !naturalWidth || !naturalHeight || !renderedWidth || !renderedHeight) {
    return null;
  }
  
  
  // Apply THE EXACT SAME validation and transforms as SmartCropImg
  const iw = naturalWidth;
  const ih = naturalHeight; 
  const cw = renderedWidth;
  const ch = renderedHeight;
  
  // Use the EXACT SAME validation logic as SmartCropImg
  const isValidBbox = itemBbox && Array.isArray(itemBbox) && itemBbox.length === 4 && iw > 0 && ih > 0;
  
  let imageScale, imageOffsetX, imageOffsetY;
  
  if (!isValidBbox) {
    // No smart cropping - use simple object-fit: contain (matches SmartCropImg fallback)
    imageScale = Math.min(cw / iw, ch / ih);
    imageOffsetX = (cw - iw * imageScale) / 2;
    imageOffsetY = (ch - ih * imageScale) / 2;
  } else {
    // Smart cropping is active - replicate SmartCropImg's exact logic
    const [x, y, w, h] = itemBbox; // normalized [0..1]
    const ow = w * iw;
    const oh = h * ih;
    
    const pad = 1 + paddingPct; // e.g., 1.10 for 10% slack
    imageScale = Math.min(cw / (ow * pad), ch / (oh * pad));
    
    // Calculate the center position for the bbox within the container (match SmartCropImg)
    const scaledImageWidth = iw * imageScale;
    const scaledImageHeight = ih * imageScale;
    
    // Center the entire scaled image first
    const imageLeft = (cw - scaledImageWidth) / 2;
    const imageTop = (ch - scaledImageHeight) / 2;
    
    // Then adjust to center the bbox
    const bboxCenterX = (x + w/2) * iw * imageScale;
    const bboxCenterY = (y + h/2) * ih * imageScale;
    
    imageOffsetX = imageLeft + (cw / 2 - bboxCenterX);
    imageOffsetY = imageTop + (ch / 2 - bboxCenterY);
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {preds.map((p, i) => {
        // Handle both old and new bbox formats for compatibility
        let boxX, boxY, boxW, boxH;
        
        if (p.box && typeof p.box === 'object' && 'xmin' in p.box) {
          // Old format: {xmin, ymin, xmax, ymax}
          boxX = p.box.xmin;
          boxY = p.box.ymin; 
          boxW = p.box.xmax - p.box.xmin;
          boxH = p.box.ymax - p.box.ymin;
        } else if (Array.isArray(p.box) && p.box.length === 4) {
          // New format: [x, y, width, height]
          [boxX, boxY, boxW, boxH] = p.box;
        } else {
          return null; // Invalid bbox format
        }
        
        // Apply the EXACT SAME coordinate transformation as SmartCropImg
        const w = boxW * iw * imageScale;
        const h = boxH * ih * imageScale;
        const x = boxX * iw * imageScale + imageOffsetX;
        const y = boxY * ih * imageScale + imageOffsetY;
        const pct = Math.round(p.score * 100);

        return (
          <div 
            key={i} 
            className="absolute"
            style={{ left: x, top: y, width: w, height: h }}
          >
            <div className="absolute inset-0 rounded-md border-2 border-white/90 shadow-[0_0_0_2px_rgba(99,102,241,0.75)]" />
            <div className="absolute -top-7 left-0 px-2 py-0.5 rounded-md 
                            bg-violet-600 text-white text-xs font-medium shadow whitespace-nowrap">
              {p.label} {pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}