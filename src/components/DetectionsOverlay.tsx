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
  console.log('[DEBUG DetectionsOverlay] itemBbox:', itemBbox, 'paddingPct:', paddingPct);
  console.log('[DEBUG DetectionsOverlay] dimensions:', {naturalWidth, naturalHeight, renderedWidth, renderedHeight});
  console.log('[DEBUG DetectionsOverlay] bbox validation:', {
    isArray: Array.isArray(itemBbox),
    length: itemBbox?.length,
    hasNaturalDims: naturalWidth > 0 && naturalHeight > 0
  });
  
  if (!preds || preds.length === 0 || !naturalWidth || !naturalHeight || !renderedWidth || !renderedHeight) {
    console.log('[DEBUG DetectionsOverlay] Not rendering - missing data');
    return null;
  }

  console.log('[DEBUG DetectionsOverlay] First pred box:', preds[0]?.box);
  
  
  // Apply THE EXACT SAME validation and transforms as SmartCropImg
  const iw = naturalWidth;
  const ih = naturalHeight; 
  const cw = renderedWidth;
  const ch = renderedHeight;
  
  // Use the EXACT SAME validation logic as SmartCropImg
  const isValidBbox = itemBbox && Array.isArray(itemBbox) && itemBbox.length === 4 && iw > 0 && ih > 0;
  
  let imageScale, imageOffsetX, imageOffsetY;
  
  if (!isValidBbox) {
    console.log('[DEBUG DetectionsOverlay] Using simple object-fit:contain logic');
    // No smart cropping - use simple object-fit: contain (matches SmartCropImg fallback)
    imageScale = Math.min(cw / iw, ch / ih);
    imageOffsetX = (cw - iw * imageScale) / 2;
    imageOffsetY = (ch - ih * imageScale) / 2;
  } else {
    console.log('[DEBUG DetectionsOverlay] Using smart crop logic with bbox:', itemBbox);
    // Smart cropping is active - replicate SmartCropImg's exact logic
    const [x, y, w, h] = itemBbox; // normalized [0..1]
    const ow = w * iw;
    const oh = h * ih;
    
    const pad = 1 + paddingPct; // e.g., 1.10 for 10% slack
    imageScale = Math.min(cw / (ow * pad), ch / (oh * pad));
    
    // Calculate the offset to center the bbox within the container (same as SmartCropImg)
    imageOffsetX = cw / 2 - (x + w/2) * iw * imageScale;
    imageOffsetY = ch / 2 - (y + h/2) * ih * imageScale;
  }
  
  console.log('[DEBUG DetectionsOverlay] Transform:', {
    imageScale, imageOffsetX, imageOffsetY, 
    smartCrop: !!itemBbox
  });

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {preds.map((p, i) => {
        // Apply the EXACT SAME coordinate transformation as SmartCropImg
        const w = (p.box.xmax - p.box.xmin) * iw * imageScale;
        const h = (p.box.ymax - p.box.ymin) * ih * imageScale;
        const x = p.box.xmin * iw * imageScale + imageOffsetX;
        const y = p.box.ymin * ih * imageScale + imageOffsetY;
        const pct = Math.round(p.score * 100);

        console.log(`[DEBUG DetectionsOverlay] Box ${i}: norm=(${p.box.xmin.toFixed(3)},${p.box.ymin.toFixed(3)}), final=(${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)})`);

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