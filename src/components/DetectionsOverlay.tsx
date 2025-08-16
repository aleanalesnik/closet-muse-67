import React from 'react';

type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { label: string; score: number; box: YolosBox };

type Props = {
  preds?: YolosPred[] | null;
  naturalWidth: number;   // from <img>.naturalWidth
  naturalHeight: number;  // from <img>.naturalHeight
  renderedWidth: number;  // from container/image clientWidth
  renderedHeight: number; // from container/image clientHeight
};

export default function DetectionsOverlay({
  preds = [],
  naturalWidth, 
  naturalHeight, 
  renderedWidth, 
  renderedHeight,
}: Props) {
  console.log('[DEBUG DetectionsOverlay] preds:', preds, 'dimensions:', {naturalWidth, naturalHeight, renderedWidth, renderedHeight});
  
  if (!preds || preds.length === 0 || !naturalWidth || !naturalHeight || !renderedWidth || !renderedHeight) {
    console.log('[DEBUG DetectionsOverlay] Not rendering - missing data');
    return null;
  }

  console.log('[DEBUG DetectionsOverlay] First pred box:', preds[0]?.box);
  
  // The issue: SmartCropImg applies transforms, but we're mapping coordinates to the container
  // Solution: Account for how the image is actually displayed within the container
  
  // Calculate how the image fits within the container (similar to object-fit: contain)
  const imageAspectRatio = naturalWidth / naturalHeight;
  const containerAspectRatio = renderedWidth / renderedHeight;
  
  let displayedImageWidth, displayedImageHeight, imageOffsetX, imageOffsetY;
  
  if (imageAspectRatio > containerAspectRatio) {
    // Image is wider - fits to container width, centered vertically
    displayedImageWidth = renderedWidth;
    displayedImageHeight = renderedWidth / imageAspectRatio;
    imageOffsetX = 0;
    imageOffsetY = (renderedHeight - displayedImageHeight) / 2;
  } else {
    // Image is taller - fits to container height, centered horizontally  
    displayedImageWidth = renderedHeight * imageAspectRatio;
    displayedImageHeight = renderedHeight;
    imageOffsetX = (renderedWidth - displayedImageWidth) / 2;
    imageOffsetY = 0;
  }
  
  console.log('[DEBUG DetectionsOverlay] Image display:', {
    displayedImageWidth, displayedImageHeight, imageOffsetX, imageOffsetY,
    imageAspectRatio, containerAspectRatio
  });

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {preds.map((p, i) => {
        // Map normalized coordinates to the displayed image area
        const w = (p.box.xmax - p.box.xmin) * displayedImageWidth;
        const h = (p.box.ymax - p.box.ymin) * displayedImageHeight;
        const x = p.box.xmin * displayedImageWidth + imageOffsetX;
        const y = p.box.ymin * displayedImageHeight + imageOffsetY;
        const pct = Math.round(p.score * 100);

        console.log(`[DEBUG DetectionsOverlay] Box ${i}: raw=(${p.box.xmin},${p.box.ymin},${p.box.xmax},${p.box.ymax}), rendered=(${x},${y},${w},${h})`);
        
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