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
  
  
  // The DetectionsOverlay needs to apply the SAME transforms as SmartCropImg
  // to ensure boxes appear exactly where the image content is displayed
  
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {preds.map((p, i) => {
        // Apply the same coordinate transformation as the displayed image
        // Since detections are in normalized image coordinates [0,1],
        // we need to map them to the actual pixels where the image content appears
        
        // Simple mapping: normalized coords * displayed image dimensions + offsets
        const w = (p.box.xmax - p.box.xmin) * naturalWidth;
        const h = (p.box.ymax - p.box.ymin) * naturalHeight;
        const x = p.box.xmin * naturalWidth;
        const y = p.box.ymin * naturalHeight;
        
        // Now scale to fit the rendered size (same as img element scaling)
        const scale = Math.min(renderedWidth / naturalWidth, renderedHeight / naturalHeight);
        const scaledW = w * scale;
        const scaledH = h * scale;
        const scaledX = x * scale;
        const scaledY = y * scale;
        
        // Center the scaled coordinates in the container
        const finalX = scaledX + (renderedWidth - naturalWidth * scale) / 2;
        const finalY = scaledY + (renderedHeight - naturalHeight * scale) / 2;
        const pct = Math.round(p.score * 100);

        console.log(`[DEBUG DetectionsOverlay] Box ${i}: normalized=(${p.box.xmin.toFixed(3)},${p.box.ymin.toFixed(3)},${p.box.xmax.toFixed(3)},${p.box.ymax.toFixed(3)}), final=(${finalX.toFixed(1)},${finalY.toFixed(1)},${scaledW.toFixed(1)},${scaledH.toFixed(1)})`);

        return (
          <div 
            key={i} 
            className="absolute"
            style={{ left: finalX, top: finalY, width: scaledW, height: scaledH }}
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